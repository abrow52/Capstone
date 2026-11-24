import { db } from "./firebase.js";

import {collection, getDocs} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const generateScheduleBtn = document.getElementById("generateScheduleBtn");
const autoSchedulePanel = document.getElementById("autoSchedulePanel");
const startAutoScheduleBtn = document.getElementById("startAutoScheduleBtn");
const cancelAutoScheduleBtn = document.getElementById("cancelAutoScheduleBtn");

const startDateInput = document.getElementById("autoScheduleStart");
const endDateInput = document.getElementById("autoScheduleEnd");


async function loadAutoScheduleData() {
    const [
        employeeSnapshot,
        availabilitySnapshot,
        shiftSnapshot,
        scheduleSnapshot,
        requestSnapshot,
        timeOffSnapshot
    ] = await Promise.all([
        getDocs(collection(db, "userInfo")),
        getDocs(collection(db, "availability")),
        getDocs(collection(db, "shifts")),
        getDocs(collection(db, "schedule")),
        getDocs(collection(db, "Requests")),
        getDocs(collection(db, "TimeOff"))
    ]);

    // employee info
    const employees = employeeSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));

    // approved availability
    const availability = availabilitySnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));

    // shifts
    const shifts = shiftSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));

    // saved schedules
    const schedules = scheduleSnapshot.docs.map(document => ({
        id: document.id,
        ...document.data()
    }));

    //pending requests
    const pendingRequests = requestSnapshot.docs
        .map(document => ({
            id: document.id,
            ...document.data()
        }))
        .filter(request => request.Status === "Pending");
    
    // approved time-off records
    const timeOff = timeOffSnapshot.docs
        .map(document => ({
            id: document.id,
            ...document.data()
        }))
        .filter(record => record.Approved === true);

    return {
        employees,
        availability,
        shifts,
        schedules,
        pendingRequests,
        timeOff
    };
}


const weekdays = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday"
];

function getDocumentId(reference) {
    if (!reference) return null;

    return reference.id ||
        reference.path?.split("/").pop() ||
        null;
}

function timeToMinutes(time) {
    if (typeof time === "number") {
        return time * 60;
    }

    if (typeof time === "string") {
        const [hours, minutes = "0"] = time.split(":");

        return Number(hours) * 60 + Number(minutes);
    }

    return NaN;
}

//slightly different than the one if shifts.js
function hasApprovedTimeOff(records, employeeID, shiftEvent) {
    const shiftStart = timeToMinutes(shiftEvent.shiftStart);
    const shiftEnd = timeToMinutes(shiftEvent.shiftEnd);

    return (records || []).some(record => {
        if (record.Approved !== true) return false;

        // match time off with employees
        if (getDocumentId(record.id) !== employeeID) {
            return false;
        }

        const startDate = record.StartDayTime;
        const endDate = record.EndDayTime;

        if (!startDate || !endDate) return false;

        if (shiftEvent.date < startDate || shiftEvent.date > endDate) {
            return false;
        }

        // no time means full day off
        if (!record.StartTime || !record.EndTime) {
            return true;
        }

        const timeOffStart = timeToMinutes(record.StartTime);
        const timeOffEnd = timeToMinutes(record.EndTime);

        if (!Number.isFinite(timeOffStart) || !Number.isFinite(timeOffEnd)) {
            return true;
        }

        return shiftStart < timeOffEnd &&
               timeOffStart < shiftEnd;
    });
}

function getShiftHours(shift) {
    const start = timeToMinutes(shift?.ShiftTime?.StartTime);
    const end = timeToMinutes(shift?.ShiftTime?.EndTime);

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start
    ) {
        return 0;
    }

    return (end - start) / 60;
}


function parseLocalDate(dateString) {
    const [year, month, day] = dateString.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatLocalDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getSundayDate(date) {
    const sunday = new Date(date);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    return formatLocalDate(sunday);
}


function getAvailabilityStartDate(record) {
    const value = record.StartDate;

    if (value?.toDate) {
        return value.toDate();
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value === "string") {
        return parseLocalDate(value);
    }

    return null;
}

function getEffectiveAvailability(records, employeeID, date) {
    const applicableRecords = records
        .filter(record => {
            if (getDocumentId(record.id) !== employeeID) {
                return false;
            }

            const startDate = getAvailabilityStartDate(record);

            return startDate &&
                formatLocalDate(startDate) <= formatLocalDate(date);
        })
        .sort((a, b) =>
            getAvailabilityStartDate(b) - getAvailabilityStartDate(a)
        );

    return applicableRecords[0] || null;
}

function getAvailabilityForDate(records, employeeID, date) {
    const record = getEffectiveAvailability(
        records,
        employeeID,
        date
    );

    if (!record?.DayTimeAvail) return null;

    const weekday = weekdays[date.getDay()];
    const dayAvailability = record.DayTimeAvail[weekday];

    if (!dayAvailability) return null;

    const start = timeToMinutes(dayAvailability.StartTime);
    const end = timeToMinutes(dayAvailability.EndTime);

    if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start
    ) {
        return null;
    }

    return {
        start: dayAvailability.StartTime,
        end: dayAvailability.EndTime,
        startMinutes: start,
        endMinutes: end
    };
}

//priority of who gets scheduled first
function buildEmployeePriority(data, targets, startDateString, endDateString) {
    const startDate = parseLocalDate(startDateString);
    const endDate = parseLocalDate(endDateString);

    const priority = data.employees.map(employee => {
        let availableDays = 0;

        for (
            let date = new Date(startDate);
            date <= endDate;
            date.setDate(date.getDate() + 1)
        ) {
            const availability = getAvailabilityForDate(
                data.availability,
                employee.id,
                date
            );

            if (availability) {
                availableDays++;
            }
        }

        const hasHoursTarget =
            employee.Hours !== undefined &&
            employee.Hours !== null &&
            employee.Hours !== "" &&
            Number.isFinite(Number(employee.Hours)) &&
            Number(employee.Hours) >= 0;

        const isManager =
            String(employee.Title || "").toLowerCase() === "manager";

        const employeeTargets = targets.filter(
            target => target.employeeID === employee.id
        );

        return {
            employeeID: employee.id,
            employeeName: employee.Name || employee.id,
            isManager,
            hasHoursTarget,
            weeklyHours: hasHoursTarget ? Number(employee.Hours) : null,
            availableDays,
            targets: employeeTargets
        };
    });

    // Employees with weekly hours come first
    // Managers come next
    // Employees with fewer available days come before those with more
    // Anyone left comes last
    priority.sort((a, b) => {
        if (a.hasHoursTarget !== b.hasHoursTarget) {
            return a.hasHoursTarget ? -1 : 1;
        }

        if (a.isManager !== b.isManager) {
            return a.isManager ? -1 : 1;
        }

        return a.availableDays - b.availableDays;
    });

    return priority;
}


function generateShiftOccurrences(data, startDateString, endDateString) {
    const occurrences = [];

    const dayCodes = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const shiftNames = {
        M: "Morning",
        E: "Evening",
        N: "Night"
    };

    const startDate = parseLocalDate(startDateString);
    const endDate = parseLocalDate(endDateString);

    for (
        let date = new Date(startDate);
        date <= endDate;
        date.setDate(date.getDate() + 1)
    ) {
        const dateString = formatLocalDate(date);
        const dayCode = dayCodes[date.getDay()];

        for (const shift of data.shifts) {
            if (!shift.id || !shift.ShiftTime) continue;

            const shiftParts = shift.id.split(":");
            const shiftDay = shiftParts[0];
            const shiftType = shiftParts[1];

            // Only generate shifts for their designated weekday
            if (shiftDay !== dayCode) continue;

            // Respect excluded dates.
            if (shift.ExcludedDates?.includes(dateString)) {
                continue;
            }

            // check the shifts active date range
            const shiftStartDate = shift.ShiftDate?.StartDate;
            const shiftEndDate = shift.ShiftDate?.EndDate;

            if (shiftStartDate && dateString < shiftStartDate) {
                continue;
            }

            if (shiftEndDate && dateString > shiftEndDate) {
                continue;
            }

            const shiftStart = shift.ShiftTime.StartTime;
            const shiftEnd = shift.ShiftTime.EndTime;

            if (shiftStart == null || shiftEnd == null) {
                continue;
            }

            const startMinutes = timeToMinutes(shiftStart);
            const endMinutes = timeToMinutes(shiftEnd);

            if (
                !Number.isFinite(startMinutes) ||
                !Number.isFinite(endMinutes) ||
                endMinutes <= startMinutes
            ) {
                continue;
            }

            occurrences.push({
                shiftID: shift.id,
                shiftType: shiftNames[shiftType] || shiftType,
                shiftStart,
                shiftEnd,
                date: dateString,
                hours: (endMinutes - startMinutes) / 60
            });
        }
    }

    occurrences.sort((a, b) => {
        if (a.date !== b.date) {
            return a.date.localeCompare(b.date);
        }

        return timeToMinutes(a.shiftStart) -
            timeToMinutes(b.shiftStart);
    });

    return occurrences;
}


function getEmployeesAvailableForShift(data, employeePriority, shiftEvent) {
    const shiftDate = parseLocalDate(shiftEvent.date);
    const shiftStart = timeToMinutes(shiftEvent.shiftStart);
    const shiftEnd = timeToMinutes(shiftEvent.shiftEnd);

    const eligible = [];

    for (const employee of employeePriority) {
        const availability = getAvailabilityForDate(
            data.availability,
            employee.employeeID,
            shiftDate
        );

        if (!availability) continue;

        if (
            availability.startMinutes > shiftStart ||
            availability.endMinutes < shiftEnd
        ) {
            continue;
        }

        // check timeOff for employees to exclude
        if (hasApprovedTimeOff(data.timeOff, employee.employeeID, shiftEvent)) {
            continue;
        }

        eligible.push({
            ...employee,
            shiftID: shiftEvent.shiftID,
            date: shiftEvent.date,
            shiftStart: shiftEvent.shiftStart,
            shiftEnd: shiftEvent.shiftEnd,
            shiftHours: shiftEvent.hours
        });
    }

    return eligible;
}


function autoShiftsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}

function buildAutoSchedulePlan(
    data,
    analysis,
    targets,
    shiftEligibility,
    startDateString,
    endDateString,
    existingOption,
    bridgeState) {
    const selectedStart = parseLocalDate(startDateString);
    const selectedEnd = parseLocalDate(endDateString);

    // in replace mode saved assignments are allowed to be reassinged
    const effectiveAssignments = getEffectiveAssignments(
        data,
        analysis,
        bridgeState
    );
    
    const fixedAssignments = effectiveAssignments.filter(assignment => {
        const assignmentDate = parseLocalDate(assignment.date);
    
        if (
            existingOption === "replace" &&
            assignmentDate >= selectedStart &&
            assignmentDate <= selectedEnd
        ) {
            return false;
        }
    
        return true;
    });

    const shiftLookup = new Map(
        data.shifts.map(shift => [shift.id, shift])
    );

    // start by counting hours of shifts that won't change
    const currentHours = new Map();

    fixedAssignments.forEach(assignment => {
        const key = `${assignment.employeeID}|${assignment.weekStart}`;
        currentHours.set(
            key,
            (currentHours.get(key) || 0) + assignment.hours
        );
    });

    const plannedAssignments = [];

    // Check for a conflict to prevent overlapping shifts
    function hasConflict(employeeID, shift) {
        const assignmentsToCheck = [
            ...fixedAssignments,
            ...plannedAssignments
        ];

        return assignmentsToCheck.some(assignment => {
            if (
                assignment.employeeID !== employeeID ||
                assignment.date !== shift.date
            ) {
                return false;
            }

            const existingShift = shiftLookup.get(assignment.shiftID);

            if (!existingShift?.ShiftTime) {
                return false;
            }

            const existingStart = timeToMinutes(
                existingShift.ShiftTime.StartTime
            );
            const existingEnd = timeToMinutes(
                existingShift.ShiftTime.EndTime
            );

            const proposedStart = timeToMinutes(shift.shiftStart);
            const proposedEnd = timeToMinutes(shift.shiftEnd);

            if (
                !Number.isFinite(existingStart) ||
                !Number.isFinite(existingEnd) ||
                !Number.isFinite(proposedStart) ||
                !Number.isFinite(proposedEnd)
            ) {
                return false;
            }

            return autoShiftsOverlap(
                existingStart,
                existingEnd,
                proposedStart,
                proposedEnd
            );
        });
    }

    // fill in shifts with the smallest number of available employees
    const shiftsToPlan = [...shiftEligibility].sort((a, b) => {
        if (
            a.eligibleEmployees.length !==
            b.eligibleEmployees.length
        ) {
            return a.eligibleEmployees.length -
                b.eligibleEmployees.length;
        }

        if (a.shift.date !== b.shift.date) {
            return a.shift.date.localeCompare(b.shift.date);
        }

        return timeToMinutes(a.shift.shiftStart) -
            timeToMinutes(b.shift.shiftStart);
    });

    shiftsToPlan.forEach(({ shift, eligibleEmployees }) => {
        const shiftDate = parseLocalDate(shift.date);

        const alreadyAssigned = fixedAssignments.some(assignment =>
            assignment.shiftID === shift.shiftID &&
            assignment.date === shift.date
        );

        if (alreadyAssigned) {
            return;
        }

        const weekStart = getSundayDate(shiftDate);

        for (const employee of eligibleEmployees) {
            const employeeID = employee.employeeID || employee.id;

            if (!employeeID) {
                continue;
            }

            if (hasConflict(employeeID, shift)) {
                continue;
            }

            const targetRecord = targets.find(target =>
                target.employeeID === employeeID &&
                target.weekStart === weekStart
            );

            if (targetRecord?.hasHoursTarget) {
                const hoursKey = `${employeeID}|${weekStart}`;
                const hoursSoFar = currentHours.get(hoursKey) || 0;
                const weeklyTarget = targetRecord.proratedTarget;

                if (hoursSoFar >= weeklyTarget) {
                    continue;
                }
            }

            const assignment = {
                employeeID,
                employeeName: employee.employeeName || "Unknown",
                shiftID: shift.shiftID,
                shiftType: shift.shiftType,
                date: shift.date,
                weekStart,
                hours: shift.hours
            };

            plannedAssignments.push(assignment);

            const hoursKey = `${employeeID}|${weekStart}`;
            currentHours.set(
                hoursKey,
                (currentHours.get(hoursKey) || 0) + shift.hours
            );

            break;
        }
    });

    return {
        plannedAssignments,
        unfilledShifts: shiftsToPlan
            .filter(({ shift }) =>
                !plannedAssignments.some(assignment =>
                    assignment.shiftID === shift.shiftID &&
                    assignment.date === shift.date
                )
            )
            .map(({ shift }) => shift)
    };
}

//get schdules from db
function getEffectiveAssignments(data, analysis, bridgeState) {
    const shiftLookup = new Map(
        data.shifts.map(shift => [shift.id, shift])
    );

    const assignmentsByKey = new Map();

    analysis.existingAssignments.forEach(assignment => {
        const key = `${assignment.date}|${assignment.shiftID}`;
        assignmentsByKey.set(key, { ...assignment });
    });

    // apply pending changes over saved ones
    (bridgeState?.pendingAssignments || []).forEach(pending => {
        const key = `${pending.date}|${pending.shiftID}`;

        if (!pending.employeeID) {
            assignmentsByKey.delete(key);
            return;
        }

        const shift = shiftLookup.get(pending.shiftID);
        const hours = shift ? getShiftHours(shift) : 0;

        const date = parseLocalDate(pending.date);

        assignmentsByKey.set(key, {
            employeeID: pending.employeeID,
            employeeName: pending.employeeName || "Unknown",
            shiftID: pending.shiftID,
            date: pending.date,
            weekStart: getSundayDate(date),
            hours
        });
    });

    return Array.from(assignmentsByKey.values());
}


function analyzeExistingAssignments(data) {
    const shiftLookup = new Map(
        data.shifts.map(shift => [shift.id, shift])
    );

    const employeeLookup = new Map(
        data.employees.map(employee => [employee.id, employee])
    );

    const existingAssignments = [];
    const weeklyHours = new Map();

    for (const scheduleDocument of data.schedules) {
        const scheduleData = scheduleDocument.schedule;

        if (!scheduleData) continue;

        const weekStart = scheduleDocument.scheduleID ||
            scheduleDocument.id;

        const sunday = new Date(`${weekStart}T00:00:00`);

        if (Number.isNaN(sunday.getTime())) {
            console.warn("Invalid schedule week:", weekStart);
            continue;
        }

        weekdays.forEach((weekday, dayIndex) => {
            const daySchedule = scheduleData[weekday];

            if (!daySchedule) return;

            const shiftDate = new Date(sunday);
            shiftDate.setDate(sunday.getDate() + dayIndex);

            const dateKey = [
                shiftDate.getFullYear(),
                String(shiftDate.getMonth() + 1).padStart(2, "0"),
                String(shiftDate.getDate()).padStart(2, "0")
            ].join("-");

            Object.values(daySchedule).forEach(slot => {
                if (!slot?.Associate || !slot?.ShiftID) return;

                const employeeID = getDocumentId(slot.Associate);
                const shiftID = getDocumentId(slot.ShiftID);

                const employee = employeeLookup.get(employeeID);
                const shift = shiftLookup.get(shiftID);

                if (!employee || !shift) {
                    console.warn(
                        "Could not match an existing assignment:",
                        { employeeID, shiftID, dateKey }
                    );
                    return;
                }

                const hours = getShiftHours(shift);

                if (hours <= 0) return;

                const assignment = {
                    employeeID,
                    employeeName: employee.Name || employeeID,
                    shiftID,
                    date: dateKey,
                    weekStart,
                    hours
                };

                existingAssignments.push(assignment);

                const weeklyKey = `${employeeID}|${weekStart}`;

                weeklyHours.set(
                    weeklyKey,
                    (weeklyHours.get(weeklyKey) || 0) + hours
                );
            });
        });
    }

    return {
        existingAssignments,
        weeklyHours
    };
}

//calculate how many hours to attempt to schedule an employee based on the selected days in the week
function calculateEmployeeTargets(data, analysis, startDateString, endDateString, existingOption) {
    const startDate = parseLocalDate(startDateString);
    const endDate = parseLocalDate(endDateString);

    const selectedDaysByWeek = new Map();

    for (
        let date = new Date(startDate);
        date <= endDate;
        date.setDate(date.getDate() + 1)
    ) {
        const weekStart = getSundayDate(date);

        selectedDaysByWeek.set(
            weekStart,
            (selectedDaysByWeek.get(weekStart) || 0) + 1
        );
    }

    const results = [];

    for (const employee of data.employees) {
        const hasHoursTarget =
            employee.Hours !== undefined &&
            employee.Hours !== null &&
            employee.Hours !== "" &&
            Number.isFinite(Number(employee.Hours)) &&
            Number(employee.Hours) >= 0;

        const weeklyTarget = hasHoursTarget
            ? Number(employee.Hours)
            : null;

        for (const [weekStart, selectedDays] of selectedDaysByWeek) {
            const proratedTarget = weeklyTarget * (selectedDays / 7);

            let existingHours = 0;

            for (const assignment of analysis.existingAssignments) {
                if (
                    assignment.employeeID !== employee.id ||
                    assignment.weekStart !== weekStart
                ) {
                    continue;
                }

                const assignmentIsInSelectedRange =
                    assignment.date >= startDateString &&
                    assignment.date <= endDateString;

                if (
                    existingOption === "replace" &&
                    assignmentIsInSelectedRange
                ) {
                    continue;
                }

                existingHours += assignment.hours;
            }

            const remainingHours = Math.max(
                0,
                proratedTarget - existingHours
            );

            results.push({
                employeeID: employee.id,
                employeeName: employee.Name || employee.id,
                weekStart,
                weeklyTarget,
                hasHoursTarget,
                selectedDays,
                proratedTarget: hasHoursTarget ? proratedTarget : null,
                existingHours,
                remainingHours: hasHoursTarget ? remainingHours : null
            });
        }
    }

    return results;
}


// Open the automatic scheduling panel
if (generateScheduleBtn) {
    generateScheduleBtn.addEventListener("click", () => {
        autoSchedulePanel.style.display = "block";

        // Default to today's date
        const today = new Date();
        const todayString = [
            today.getFullYear(),
            String(today.getMonth() + 1).padStart(2, "0"),
            String(today.getDate()).padStart(2, "0")
        ].join("-");

        startDateInput.value = todayString;
        endDateInput.value = todayString;
        startDateInput.min = todayString;
        endDateInput.min = todayString;
    });
}

// Keep the end date from being earlier than the start date
if (startDateInput) {
    startDateInput.addEventListener("change", () => {
        endDateInput.min = startDateInput.value;

        if (
            endDateInput.value &&
            endDateInput.value < startDateInput.value
        ) {
            endDateInput.value = startDateInput.value;
        }
    });
}

// Cancel generation setup
if (cancelAutoScheduleBtn) {
    cancelAutoScheduleBtn.addEventListener("click", () => {
        autoSchedulePanel.style.display = "none";
    });
}

// Validate the selected dates and scheduling option
if (startAutoScheduleBtn) {
    startAutoScheduleBtn.addEventListener("click", async () => {
        const startDate = startDateInput.value;
        const endDate = endDateInput.value;

        if (!startDate || !endDate) {
            alert("Please select both a start date and an end date.");
            return;
        }

        if (endDate < startDate) {
            alert("The end date cannot be before the start date.");
            return;
        }

        const existingOption = document.querySelector(
            'input[name="existingScheduleOption"]:checked'
        )?.value;

        if (!existingOption) {
            alert("Please select how existing assignments should be handled.");
            return;
        }

        // Temporary confirmation while we build the generator
        const confirmed = confirm(
            "Have you reviewed all pending employee requests?\n\n" +
            `Schedule dates: ${startDate} to ${endDate}\n\n` +
            `Existing assignments: ${
                existingOption === "retain"
                    ? "Retain"
                    : "Allow replacement"
            }\n\n` +
            "Continue with these settings?"
        );

        if (!confirmed) return;

        startAutoScheduleBtn.disabled = true;
        startAutoScheduleBtn.textContent = "Loading data...";

        try {
            const data = await loadAutoScheduleData();

            const analysis = analyzeExistingAssignments(data);

            const targets = calculateEmployeeTargets(
                data,
                analysis,
                startDate,
                endDate,
                existingOption
            );

            const employeePriority = buildEmployeePriority(
                data,
                targets,
                startDate,
                endDate
            );
            
            const shiftOccurrences = generateShiftOccurrences(
                data,
                startDate,
                endDate
            );
            
            const shiftEligibility = shiftOccurrences.map(shift => ({
                shift,
                eligibleEmployees: getEmployeesAvailableForShift(
                    data,
                    employeePriority,
                    shift
                )
            }));
            
            const bridgeState = window.autoSchedulerBridge?.getSchedulingState();

            const schedulePlan = buildAutoSchedulePlan(
                data,
                analysis,
                targets,
                shiftEligibility,
                startDate,
                endDate,
                existingOption,
                bridgeState
            );

            if (!window.autoSchedulerBridge?.stageGeneratedAssignments) {
                alert("The scheduling connection is unavailable. Please reload the page.");
                return;
            }
            
            if (schedulePlan.plannedAssignments.length === 0) {
                alert("No assignments could be generated for the selected date range.");
                return;
            }
            
            const confirmationMessage = existingOption === "replace"
                ? `This will replace pending changes and existing assignments within the selected date range with ${schedulePlan.plannedAssignments.length} generated assignments. Nothing will be saved until you click Save Schedule. Continue?`
                : `This will add ${schedulePlan.plannedAssignments.length} generated assignments while retaining existing assignments. Nothing will be saved until you click Save Schedule. Continue?`;
            
            if (!confirm(confirmationMessage)) {
                return;
            }
            
            const stagingResult = window.autoSchedulerBridge.stageGeneratedAssignments(
                schedulePlan.plannedAssignments,
                {
                    existingOption,
                    startDate,
                    endDate
                }
            );
                        
            let resultMessage =
                `${stagingResult.stagedCount} assignments were staged successfully.`;
            
            if (schedulePlan.unfilledShifts.length > 0) {
                resultMessage +=
                    `\n\n${schedulePlan.unfilledShifts.length} shifts could not be filled.`;
            }
            
            if (stagingResult.failedAssignments.length > 0) {
                resultMessage +=
                    `\n\n${stagingResult.failedAssignments.length} assignments could not be staged.`;
            }
            
            resultMessage +=
                "\n\nReview the calendar before clicking Save Schedule.";
            
            alert(resultMessage);

        } catch (error) {
            console.error("Error loading auto-scheduler data:", error);

        } finally {
            startAutoScheduleBtn.disabled = false;
            startAutoScheduleBtn.textContent = "Continue";
        }

    });
}
