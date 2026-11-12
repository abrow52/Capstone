import { db } from "./firebase.js";

import {collection, getDocs, getDoc, setDoc, doc, runTransaction} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

let scheduleMode = false;
let shiftMode = false;
let availableShifts = [];
let pendingAssignments = [];

const createScheduleBtn = document.getElementById("createScheduleBtn");
const exitScheduleBtn = document.getElementById("exitScheduleMode");
const scheduleControls = document.getElementById("scheduleModeControls");
const showCreateShiftsBtn = document.getElementById("showCreateShifts");
const exitCreateShifts = document.getElementById("closeShiftForm");
const shiftsForm = document.getElementById("shiftsbtn");

let savedAssignments = new Map();
let calendarViewRequestId = 0;

function getShiftKey(shiftID, date) {
    return `${date.format("YYYY-MM-DD")}|${shiftID}`;
}

async function loadSavedAssignments() {
    const snapshot = await getDocs(collection(db, "schedule"));

    const weekdayOffsets = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
    };

    // First collect every assignment and unique employee reference.
    const assignmentsToLoad = [];
    const employeeRefs = new Map();

    for (const scheduleDoc of snapshot.docs) {
        const scheduleData = scheduleDoc.data();
        const weeklySchedule = scheduleData.schedule || {};

        const weekStart = moment(
            scheduleData.scheduleID || scheduleDoc.id,
            "YYYY-MM-DD",
            true
        );

        if (!weekStart.isValid()) continue;

        for (const [dayName, offset] of Object.entries(weekdayOffsets)) {
            const daySchedule = weeklySchedule[dayName] || {};
            const shiftDate = weekStart.clone().add(offset, "days");

            for (const slot of Object.values(daySchedule)) {
                if (!slot?.ShiftID || !slot?.Associate) continue;

                const employeeRef = slot.Associate;

                assignmentsToLoad.push({
                    shiftID: slot.ShiftID.id,
                    date: shiftDate.clone(),
                    employeeID: employeeRef.id,
                    employeePath: employeeRef.path
                });

                // Avoid fetching the same employee more than once.
                employeeRefs.set(employeeRef.path, employeeRef);
            }
        }
    }

    // Fetch all unique employee documents concurrently.
    const employeeResults = await Promise.all(
        Array.from(employeeRefs.entries()).map(async ([path, ref]) => {
            const employeeDoc = await getDoc(ref);

            return {
                path,
                name: employeeDoc.exists()
                    ? employeeDoc.data().Name || "Unknown Employee"
                    : null
            };
        })
    );

    const employeeNames = new Map(
        employeeResults.map(employee => [
            employee.path,
            employee.name
        ])
    );

    // Build the new map only after the reads have completed.
    const newAssignments = new Map();

    assignmentsToLoad.forEach(assignment => {
        const employeeName = employeeNames.get(assignment.employeePath);

        if (!employeeName) return;

        newAssignments.set(
            getShiftKey(assignment.shiftID, assignment.date),
            {
                employeeID: assignment.employeeID,
                employeeName
            }
        );
    });

    savedAssignments = newAssignments;
}
// async function loadSavedAssignments() {
//     savedAssignments.clear();

//     const snapshot = await getDocs(collection(db, "schedule"));

//     const weekdayOffsets = {
//         Sunday: 0,
//         Monday: 1,
//         Tuesday: 2,
//         Wednesday: 3,
//         Thursday: 4,
//         Friday: 5,
//         Saturday: 6
//     };

//     for (const scheduleDoc of snapshot.docs) {
//         const scheduleData = scheduleDoc.data();
//         const weeklySchedule = scheduleData.schedule || {};

//         const weekStart = moment(
//             scheduleData.scheduleID || scheduleDoc.id,
//             "YYYY-MM-DD",
//             true
//         );

//         if (!weekStart.isValid()) continue;

//         for (const [dayName, offset] of Object.entries(weekdayOffsets)) {
//             const daySchedule = weeklySchedule[dayName] || {};
//             const shiftDate = weekStart.clone().add(offset, "days");

//             for (const slot of Object.values(daySchedule)) {
//                 if (!slot?.ShiftID || !slot?.Associate) continue;

//                 const employeeDoc = await getDoc(slot.Associate);
//                 if (!employeeDoc.exists()) continue;

//                 const employeeData = employeeDoc.data();

//                 savedAssignments.set(
//                     getShiftKey(slot.ShiftID.id, shiftDate),
//                     {
//                         employeeID: slot.Associate.id,
//                         employeeName: employeeData.Name || "Unknown Employee"
//                     }
//                 );
//             }
//         }
//     }
// }

// used in doc ids
const weekdays = {
    Sunday: "Sun",
    Monday: "Mon",
    Tuesday: "Tue",
    Wednesday: "Wed",
    Thursday: "Thu",
    Friday: "Fri",
    Saturday: "Sat"
};
// used in doc ids
const shiftTypes = {
    Morning: "M",
    Evening: "E",
    Night: "N"
};


function closeOtherPanel(panelToKeepOpen) {
    const shiftsForm = document.getElementById("shiftsbtn");
    const schedulePanel = document.getElementById("scheduleModeControls");

    if (panelToKeepOpen === "shift") {
        if (schedulePanel) {
            schedulePanel.style.display = "none";
        }
    } 
    
    else if (panelToKeepOpen === "schedule") {
        if (shiftsForm) {
            shiftsForm.style.display = "none";
        }
    }
}

function hideForm() {
    if (shiftsForm) {
        shiftsForm.style.display = "none";
    }
}

window.hideForm = hideForm;

//save shifts
if (shiftsForm) {
    shiftsForm.addEventListener("submit", async (event) => {

        event.preventDefault();

        const shiftType = document.getElementById("shiftType").value;
        const startTime = document.getElementById("startTime").value;
        const endTime = document.getElementById("endTime").value;

        // get selected days
        const shiftDays = Array.from(
            document.getElementById("shiftDays").selectedOptions
        ).map(option => option.value);

        if (!shiftType || !startTime || !endTime || shiftDays.length === 0) {
            alert("Please complete all shift fields and select at least one day.");
            return;
        }

        const shiftCode = shiftTypes[shiftType];

        if (!shiftCode) {
            alert("Invalid shift type.");
            return;
        }

        try {

            // Save one uniquely numbered shift for each selected day.
            for (const day of shiftDays) {

                const dayCode = weekdays[day];

                // Example: Mon:M
                const counterID = `${dayCode}_${shiftCode}`;

                // Counter document keeps track of the next number.
                const counterRef = doc(db, "shiftCounters", counterID);

                // Generate the shift ID and save it atomically.
                await runTransaction(db, async (transaction) => {

                    const counterSnapshot =
                        await transaction.get(counterRef);

                    const currentNumber = counterSnapshot.exists()
                        ? counterSnapshot.data().count
                        : 0;

                    const nextNumber = currentNumber + 1;

                    // Example: Mon:M:1
                    const shiftID =
                        `${dayCode}:${shiftCode}:${nextNumber}`;

                    const shiftRef =
                        doc(db, "shifts", shiftID);

                    // Update the counter.
                    transaction.set(counterRef, {
                        count: nextNumber
                    });

                    // Save the shift template.
                    transaction.set(shiftRef, {
                        ShiftTime: {
                            StartTime: startTime,
                            EndTime: endTime
                        }
                    });

                });

            }

            alert("Shift templates saved successfully!");

            shiftsForm.reset();
            // hideForm();

            if ((scheduleMode || shiftMode)&& window.scheduleCalendar) {
                const snapshot = await getDocs(collection(db, "shifts"));
            
                availableShifts = snapshot.docs.map(shiftDoc => ({
                    id: shiftDoc.id,
                    shiftTime: shiftDoc.data().ShiftTime
                }));
            
                if (scheduleMode) {
                    drawSchedulingEvents();
                } else if (shiftMode) {
                    drawAvailableShiftEvents();
                }
                // window.scheduleCalendar.events =
                //     buildShiftEvents(window.scheduleCalendar.current);
            
                // window.scheduleCalendar.draw();
            }

        } catch (error) {

            console.error("Error saving shift templates:", error);

            alert("Unable to save shifts. Please try again.");

        }

    });
}

async function showShiftCalendar(allowAssignment) {
    if (sessionStorage.getItem("Title") !== "Manager") {
        alert("Only managers can create schedules.");
        return;
    }

    if (!window.scheduleCalendar) {
        alert("The calendar has not finished loading.");
        return;
    }

    // Identify this particular view change.
    // This prevents an older background request from
    // redrawing the calendar after the manager switches views.
    const requestId = ++calendarViewRequestId;

    // Switch modes immediately.
    scheduleMode = allowAssignment;
    shiftMode = !allowAssignment;

    window.isScheduleMode = allowAssignment;
    window.isShiftMode = !allowAssignment;

    if (scheduleControls) {
        scheduleControls.style.display =
            allowAssignment ? "block" : "none";
    }

    window.scheduleCalendar.onMonthChange = () => {
        if (scheduleMode) {
            drawSchedulingEvents();
        } else if (shiftMode) {
            drawAvailableShiftEvents();
        }
    };

    // If shifts have already been loaded, display them immediately.
    if (availableShifts.length > 0) {
        if (allowAssignment) {
            drawSchedulingEvents();
        } else {
            drawAvailableShiftEvents();
        }
    }

    try {
        // Load the shift templates.
        const snapshot = await getDocs(collection(db, "shifts"));

        // Ignore this result if the manager has switched views.
        if (requestId !== calendarViewRequestId) return;

        availableShifts = snapshot.docs.map(shiftDoc => ({
            id: shiftDoc.id,
            shiftTime: shiftDoc.data().ShiftTime
        }));

        // Show the available shifts immediately.
        if (allowAssignment) {
            drawSchedulingEvents();
        } else {
            drawAvailableShiftEvents();
        }

        // Load employee assignments in the background.
        // Do not make the manager wait for these reads.
        if (allowAssignment) {
            loadSavedAssignments()
                .then(() => {
                    // Only update the calendar if we're still
                    // in the same Create Schedule view.
                    if (
                        requestId === calendarViewRequestId &&
                        scheduleMode
                    ) {
                        drawSchedulingEvents();
                    }
                })
                .catch(error => {
                    console.error(
                        "Error loading saved assignments:",
                        error
                    );
                });
        }

    } catch (error) {
        console.error("Error loading shifts:", error);
        alert("Unable to load available shifts.");
    }
}

function startShiftMode() {
    return showShiftCalendar(false);
}

function startScheduleMode() {
    return showShiftCalendar(true);
}

//exit shift mode
function exitShiftMode() {

    shiftMode = false;

    if (!window.scheduleCalendar) return;

    window.isShiftMode = false;

    // const assignmentPanel = document.getElementById("shiftAssignmentPanel");

    // if (assignmentPanel) {
    //     assignmentPanel.style.display = "none";
    // }

    // Remove month-change callback.
    window.scheduleCalendar.onMonthChange = null;

    // Restore normal calendar events.
    window.scheduleCalendar.events = window.normalCalendarEvents || [];

    window.scheduleCalendar.draw();

    // Restore buttons.
    // scheduleControls.style.display = "none";

    createScheduleBtn.style.display = "inline-block";

    showCreateShiftsBtn.style.display = "inline-block";

    availableShifts = [];

}

//exit scheduling mode
function exitScheduleMode() {

    scheduleMode = false;

    if (!window.scheduleCalendar) return;

    window.isScheduleMode = false;

    const assignmentPanel = document.getElementById("shiftAssignmentPanel");

    if (assignmentPanel) {
        assignmentPanel.style.display = "none";
    }

    // Remove month-change callback.
    window.scheduleCalendar.onMonthChange = null;

    // Restore normal calendar events.
    window.scheduleCalendar.events = window.normalCalendarEvents || [];

    window.scheduleCalendar.draw();

    // Restore buttons.
    scheduleControls.style.display = "none";

    createScheduleBtn.style.display = "inline-block";

    showCreateShiftsBtn.style.display = "inline-block";

    availableShifts = [];

}

//make shifts
function buildShiftEvents(month) {

    const events = [];

    const startOfMonth = month.clone().startOf("month");

    // Loop through every day of the displayed month.
    for (
        let dayNumber = 1;
        dayNumber <= month.daysInMonth();
        dayNumber++
    ) {

        const currentDay = startOfMonth.clone().date(dayNumber);

        // Get the three-letter weekday.
        const dayCode = currentDay.format("ddd");

        availableShifts.forEach((shift) => {

            if (!shift.id || !shift.shiftTime) {
                return;
            }

            // Example ID: Mon:N
            const shiftParts = shift.id.split(":");

            const shiftDay = shiftParts[0];
            const shiftType = shiftParts[1];
            const shiftNumber = shiftParts[2];

            // Only display shifts matching this weekday.
            if (shiftDay !== dayCode) {
                return;
            }

            const startTime = shift.shiftTime.StartTime;
            const endTime = shift.shiftTime.EndTime;

            if (startTime == null || endTime == null) {
                return;
            }

            const shiftNames = {
                M: "Morning",
                E: "Evening",
                N: "Night"
            };

            const shiftName =
                shiftNames[shiftType] || shiftType;

            events.push({
                eventName:
                    `${formatShiftTime(startTime)} - ${formatShiftTime(endTime)}`,
                shiftID: shift.id,
                shiftType: shiftName,
                shiftStart: startTime,
                shiftEnd: endTime,
                color: "orange",
                date: currentDay.clone()

            });

        });

    }

    return events;

}

function formatShiftTime(time) {
    if (typeof time === "string" && time.includes(":")) {
        const [hours, minutes] = time.split(":").map(Number);
        const period = hours >= 12 ? "PM" : "AM";
        const displayHour = hours % 12 || 12;

        return `${displayHour}:${String(minutes).padStart(2, "0")} ${period}`;
    }

    if (typeof time === "number") {
        const period = time >= 12 ? "PM" : "AM";
        const displayHour = time % 12 || 12;

        return `${displayHour}:00 ${period}`;
    }

    return String(time);

}

//select a shift and find available staff members
window.selectShiftForScheduling = async function(shiftEvent) {
    if (!scheduleMode) return;

    const panel = document.getElementById("shiftAssignmentPanel");
    const details = document.getElementById("selectedShiftDetails");
    const employeeList = document.getElementById("availableEmployees");

    panel.style.display = "block";

    const selectedDate = shiftEvent.date.clone();
    const dayName = selectedDate.format("dddd");

    details.innerHTML = `
        <p><strong>${dayName}, ${selectedDate.format("MMMM D, YYYY")}</strong></p>
        <p>${shiftEvent.shiftType}: 
        ${formatShiftTime(shiftEvent.shiftStart)} -
        ${formatShiftTime(shiftEvent.shiftEnd)}</p>
    `;

    const key = getShiftKey(shiftEvent.shiftID, shiftEvent.date);

    const pending = pendingAssignments.find(item =>
        getShiftKey(item.shiftID, item.date) === key
    );

    const currentAssignment = pending
        ? (pending.employeeID ? pending : null)
        : savedAssignments.get(key);

    if (currentAssignment) {
        const unassignButton = document.createElement("button");
        unassignButton.type = "button";
        unassignButton.textContent = "Unassign Employee";

        unassignButton.addEventListener("click", () => {
            stageUnassignment(shiftEvent);
        });

        details.appendChild(unassignButton);
    }

    employeeList.textContent = "Loading available employees...";

    try {
        const availabilitySnapshot =
            await getDocs(collection(db, "availability"));

        const eligibleEmployees = [];

        for (const availabilityDoc of availabilitySnapshot.docs) {
            const availability = availabilityDoc.data();

            // Make sure the availability belongs to an employee.
            if (!availability.id) continue;

            // Ignore availability that starts after the selected date.
            const startDate = availability.StartDate?.toDate
                ? availability.StartDate.toDate()
                : new Date(availability.StartDate);

            if (startDate > selectedDate.toDate()) continue;

            const dayAvailability =
                availability.DayTimeAvail?.[dayName];

            if (!dayAvailability) continue;

            const availableStart = Number(dayAvailability.StartTime);
            const availableEnd = Number(dayAvailability.EndTime);

            const shiftStart = Number(shiftEvent.shiftStart);
            const shiftEnd = Number(shiftEvent.shiftEnd);

            if (shiftEnd <= shiftStart) continue;

            // Employee must cover the entire shift.
            if (availableStart > shiftStart || availableEnd < shiftEnd) {
                continue;
            }

            // Retrieve the employee's userInfo document.
            const userDoc = await getDoc(availability.id);

            if (!userDoc.exists()) continue;

            const userData = userDoc.data();

            eligibleEmployees.push({
                id: userDoc.id,
                name: userData.Name || userDoc.id
            });
        }

        if (eligibleEmployees.length === 0) {
            employeeList.innerHTML =
                "<p>No employees have matching availability for this shift.</p>";
            return;
        }

        employeeList.innerHTML = "";

        eligibleEmployees.forEach(employee => {
            const employeeRow = document.createElement("div");
            employeeRow.className = "available-employee";

            const employeeName = document.createElement("span");
            employeeName.textContent = employee.name;

            const assignButton = document.createElement("button");
            assignButton.type = "button";
            assignButton.id = "assignBtn";
            assignButton.textContent = "Assign";

            assignButton.addEventListener("click", () => {
                stageAssignment(employee, shiftEvent);
            });

            employeeRow.appendChild(employeeName);
            employeeRow.appendChild(assignButton);

            employeeList.appendChild(employeeRow);
        });

    } catch (error) {
        console.error("Error finding available employees:", error);
        employeeList.textContent =
            "Unable to load available employees.";
    }
};


function timeToMinutes(time) {
    if (typeof time === "number") {
      return time * 60;
    }
  
    if (typeof time === "string") {
      const [hours, minutes] = time.split(":").map(Number);
      return hours * 60 + (minutes || 0);
    }
  
    return null;
}
  
function shiftsOverlap(startA, endA, startB, endB) {
    return startA < endB && startB < endA;
}

function stageAssignment(employee, shiftEvent) {
    // Check whether this shift already has a pending assignment.
    const existingIndex = pendingAssignments.findIndex(item =>
        item.shiftID === shiftEvent.shiftID &&
        item.date.isSame(shiftEvent.date, "day")
    );

    // Prevent overlapping pending shifts for the same employee.
    const newStart = timeToMinutes(shiftEvent.shiftStart);
    const newEnd = timeToMinutes(shiftEvent.shiftEnd);

    const overlappingAssignment = pendingAssignments.find(item => {
        if (
            item.employeeID !== employee.id ||
            !item.date.isSame(shiftEvent.date, "day") ||
            item.shiftID === shiftEvent.shiftID
        ) {
            return false;
        }

        return shiftsOverlap(
            newStart,
            newEnd,
            timeToMinutes(item.shiftStart),
            timeToMinutes(item.shiftEnd)
        );
    });

    if (overlappingAssignment) {
        alert(`${employee.name} already has an overlapping pending shift.`);
        return;
    }

    const assignment = {
        employeeID: employee.id,
        employeeName: employee.name,
        shiftID: shiftEvent.shiftID,
        date: shiftEvent.date.clone(),
        shiftStart: shiftEvent.shiftStart,
        shiftEnd: shiftEvent.shiftEnd
    };

    if (existingIndex !== -1) {
        pendingAssignments[existingIndex] = assignment;
    } else {
        pendingAssignments.push(assignment);
    }

    // Redraw the calendar with the pending employee name.
    const event = window.scheduleCalendar.events.find(item =>
        item.shiftID === shiftEvent.shiftID &&
        item.date.isSame(shiftEvent.date, "day")
    );
    
    if (event) {
        event.employeeID = employee.id;
        event.employeeName = employee.name;
        event.eventName =
            `${formatShiftTime(event.shiftStart)} - ${formatShiftTime(event.shiftEnd)} — ${employee.name}`;
        event.color = "blue";
        event.isAssigned = true;
    
        updateShiftEventInPlace(event);
    }

    // Update the assignment panel.
    const details = document.getElementById("selectedShiftDetails");

    if (details) {
        details.innerHTML += `
            <p><strong>Pending assignment:</strong> ${employee.name}</p>
        `;
    }
}

function stageUnassignment(shiftEvent) {
    const key = getShiftKey(shiftEvent.shiftID, shiftEvent.date);

    const existingIndex = pendingAssignments.findIndex(item =>
        getShiftKey(item.shiftID, item.date) === key
    );

    const assignment = {
        employeeID: null,
        employeeName: null,
        shiftID: shiftEvent.shiftID,
        date: shiftEvent.date.clone(),
        shiftStart: shiftEvent.shiftStart,
        shiftEnd: shiftEvent.shiftEnd
    };

    if (existingIndex !== -1) {
        pendingAssignments[existingIndex] = assignment;
    } else {
        pendingAssignments.push(assignment);
    }

    const event = window.scheduleCalendar.events.find(item =>
        item.shiftID === shiftEvent.shiftID &&
        item.date.isSame(shiftEvent.date, "day")
    );

    if (event) {
        event.employeeID = null;
        event.employeeName = null;
        event.eventName =
            `${formatShiftTime(event.shiftStart)} - ${formatShiftTime(event.shiftEnd)}`;
        event.color = "orange";
        event.isAssigned = false;

        updateShiftEventInPlace(event);
    }

    // Update the assignment panel.
    const details = document.getElementById("selectedShiftDetails");

    if (details) {
        details.innerHTML += `<p><strong>Pending:</strong> Shift unassigned</p>`;
    }
}

// Display available shifts without showing employee assignments.
function drawAvailableShiftEvents() {
    if (!window.scheduleCalendar) return;

    const calendar = window.scheduleCalendar;

    calendar.events = buildShiftEvents(calendar.current);

    calendar.draw();
}

function drawSchedulingEvents() {
    if (!window.scheduleCalendar) return;

    const calendar = window.scheduleCalendar;
    const events = buildShiftEvents(calendar.current);

    events.forEach(event => {
        const key = getShiftKey(event.shiftID, event.date);

        // A pending change takes priority over the saved assignment.
        const pending = pendingAssignments.find(item =>
            getShiftKey(item.shiftID, item.date) === key
        );

        const assignment = pending
            ? (pending.employeeID
                ? pending
                : null)
            : savedAssignments.get(key);

        if (assignment) {
            event.employeeID = assignment.employeeID;
            event.employeeName = assignment.employeeName;
            event.eventName += ` — ${assignment.employeeName}`;
            event.color = "blue";
            event.isAssigned = true;
        } else {
            event.isAssigned = false;
        }
    });

    calendar.events = events;
    calendar.draw();
}

function updateShiftEventInPlace(shiftEvent) {
    const key = getShiftKey(shiftEvent.shiftID, shiftEvent.date);

    const selectors = [
        `.calendar-event[data-shift-key="${key}"]`,
        `.agenda-event[data-shift-key="${key}"]`
    ];

    selectors.forEach(selector => {
        const element = document.querySelector(selector);
        if (!element) return;

        const nameElement = element.querySelector(
            ".calendar-event-name, .agenda-event-name"
        );

        const colorElement = element.querySelector(".event-category");

        if (nameElement) {
            nameElement.textContent = shiftEvent.eventName;
        }

        if (colorElement) {
            colorElement.className =
                `event-category ${shiftEvent.color}`;
        }
    });
}

//assign employee to shift
async function assignEmployeeToShift(employee, shiftEvent) {
    try {
      const selectedDate = shiftEvent.date.clone();
  
      // Get the Sunday starting this schedule week.
      const sunday = selectedDate.clone().startOf("week");
  
      const scheduleID = sunday.format("YYYY-MM-DD");
      const dayName = selectedDate.format("dddd");
  
      const scheduleRef = doc(db, "schedule", scheduleID);
      const employeeRef = doc(db, "userInfo", employee.id);
      const shiftRef = doc(db, "shifts", shiftEvent.shiftID);
  
      const newStart = timeToMinutes(shiftEvent.shiftStart);
      const newEnd = timeToMinutes(shiftEvent.shiftEnd);
  
      if (newStart === null || newEnd === null || newEnd <= newStart) {
        alert("This shift has an invalid time or is an overnight shift.");
        return;
      }
  
      await runTransaction(db, async (transaction) => {
        const scheduleSnapshot = await transaction.get(scheduleRef);
  
        const existingData = scheduleSnapshot.exists()
          ? scheduleSnapshot.data()
          : {};
  
        // Support the old field name during migration.
        const weeklySchedule = existingData.schedule || existingData["schedule "] || {};
  
        const daySchedule = weeklySchedule[dayName] || {};
  
        let matchingSlot = null;
        const existingShiftReads = [];
  
        // Read all assigned shifts for this employee on this day.
        for (const [slotName, slot] of Object.entries(daySchedule)) {
          if (!slot || !slot.ShiftID) continue;
  
          // Check whether this is the shift being assigned.
          if (slot.ShiftID.path === shiftRef.path) {
            matchingSlot = { slotName, slot };
  
            if (slot.Associate && slot.Associate.path !== employeeRef.path) {
              throw new Error(
                "This shift has already been assigned to another employee."
              );
            }
            continue;
          }
  
          // Only check shifts already assigned to this employee.
          if (!slot.Associate || slot.Associate.path !== employeeRef.path) {
            continue;
          }
  
          existingShiftReads.push({
            slotName,
            shiftRef: slot.ShiftID
          });
        }
  
        // Read the shift templates before making any writes.
        for (const existingShift of existingShiftReads) {
          const existingShiftSnapshot = await transaction.get(
            existingShift.shiftRef
          );
  
          if (!existingShiftSnapshot.exists()) continue;
  
          const existingShiftData = existingShiftSnapshot.data();
          const existingTime = existingShiftData.ShiftTime || {};
  
          const existingStart = timeToMinutes(existingTime.StartTime);
          const existingEnd = timeToMinutes(existingTime.EndTime);
  
          if (
            existingStart === null ||
            existingEnd === null ||
            existingEnd <= existingStart
          ) {
            continue;
          }
  
          if (
            shiftsOverlap(
              newStart,
              newEnd,
              existingStart,
              existingEnd
            )
          ) {
            throw new Error(
              `${employee.name} already has a shift that overlaps this time.`
            );
          }
        }
  
        // Reuse the matching shift slot if it exists.
        let slotName = matchingSlot?.slotName;
  
        // Otherwise find an empty Shift1, Shift2, etc.
        if (!slotName) {
          let slotNumber = 1;
  
          while (daySchedule[`Shift${slotNumber}`]) {
            slotNumber++;
          }
  
          slotName = `Shift${slotNumber}`;
        }
  
        daySchedule[slotName] = {
          Associate: employeeRef,
          ShiftID: shiftRef
        };
  
        weeklySchedule[dayName] = daySchedule;
  
        transaction.set(scheduleRef, {
          scheduleID,
          schedule: weeklySchedule
        });
      });
  
      alert(`${employee.name} was assigned successfully.`);
  
      // Refresh the available employee list for the selected shift.
      if (window.selectShiftForScheduling) {
        await window.selectShiftForScheduling(shiftEvent);
      }
  
    } catch (error) {
      console.error("Error assigning employee:", error);
      alert(error.message || "Could not assign employee.");
    }
}

async function saveSchedule() {
    if (pendingAssignments.length === 0) {
        alert("There are no pending assignments to save.");
        return;
    }

    const saveButton = document.getElementById("saveScheduleBtn");

    try {
        if (saveButton) saveButton.disabled = true;

        // Group assignments by their Sunday-based schedule week.
        const weeklyAssignments = {};

        pendingAssignments.forEach(assignment => {
            const sunday = assignment.date.clone().startOf("week");
            const scheduleID = sunday.format("YYYY-MM-DD");

            if (!weeklyAssignments[scheduleID]) {
                weeklyAssignments[scheduleID] = [];
            }

            weeklyAssignments[scheduleID].push(assignment);
        });

        // Save each week's assignments.
        for (const [scheduleID, assignments] of Object.entries(weeklyAssignments)) {
            const scheduleRef = doc(db, "schedule", scheduleID);

            await runTransaction(db, async transaction => {
                const scheduleSnapshot = await transaction.get(scheduleRef);

                const weeklySchedule = scheduleSnapshot.exists()
                    ? scheduleSnapshot.data().schedule || {}
                    : {};

                // Apply every assignment to its weekday.
                assignments.forEach(assignment => {
                    const dayName = assignment.date.format("dddd");

                    const daySchedule = weeklySchedule[dayName] || {};

                    const shiftRef = doc(db, "shifts", assignment.shiftID);
                    const employeeRef = doc(db, "userInfo", assignment.employeeID);

                    // Find this shift's existing slot, if it has one.
                    let slotName = Object.keys(daySchedule).find(key =>
                        daySchedule[key]?.ShiftID?.path === shiftRef.path
                    );

                    // If this is an unassignment, remove the existing slot.
                    if (!assignment.employeeID) {
                        if (slotName) {
                            delete daySchedule[slotName];
                        }

                        if (Object.keys(daySchedule).length === 0) {
                            delete weeklySchedule[dayName];
                        } else {
                            weeklySchedule[dayName] = daySchedule;
                        }

                        return;
                    }

                    // Otherwise, assign the employee.
                    // const employeeRef = doc(db, "userInfo", assignment.employeeID);

                    if (!slotName) {
                        let number = 1;

                        while (daySchedule[`Shift${number}`]) {
                            number++;
                        }

                        slotName = `Shift${number}`;
                    }

                    const existingAssignment = daySchedule[slotName];

                    if (
                        existingAssignment?.Associate &&
                        existingAssignment.Associate.path !== employeeRef.path
                    ) {
                        throw new Error(
                            `The ${assignment.shiftID} shift on ${dayName} has already been assigned to someone else.`
                        );
                    }

                    daySchedule[slotName] = {
                        Associate: employeeRef,
                        ShiftID: shiftRef
                    };

                    weeklySchedule[dayName] = daySchedule;
                    // // Find this shift's existing slot, if it has one.
                    // let slotName = Object.keys(daySchedule).find(key =>
                    //     daySchedule[key]?.ShiftID?.path === shiftRef.path
                    // );

                    // // Otherwise find the next unused slot.
                    // if (!slotName) {
                    //     let number = 1;

                    //     while (daySchedule[`Shift${number}`]) {
                    //         number++;
                    //     }

                    //     slotName = `Shift${number}`;
                    // }

                    // const existingAssignment = daySchedule[slotName];

                    // if (
                    //     existingAssignment?.Associate &&
                    //     existingAssignment.Associate.path !== employeeRef.path
                    // ) {
                    //     throw new Error(
                    //         `The ${assignment.shiftID} shift on ${dayName} has already been assigned to someone else.`
                    //     );
                    // }

                    // daySchedule[slotName] = {
                    //     Associate: employeeRef,
                    //     ShiftID: shiftRef
                    // };

                    // weeklySchedule[dayName] = daySchedule;
                });

                transaction.set(scheduleRef, {
                    scheduleID,
                    schedule: weeklySchedule
                });
            });
        }

        // Update the local saved-assignment lookup.
        pendingAssignments.forEach(assignment => {
            const key = getShiftKey(assignment.shiftID, assignment.date);

            if (assignment.employeeID) {
                savedAssignments.set(key, {
                    employeeID: assignment.employeeID,
                    employeeName: assignment.employeeName
                });
            } else {
                savedAssignments.delete(key);
            }
        });

        pendingAssignments = [];

        alert("Schedule saved successfully!");
        // Only clear drafts after every weekly save succeeds.
        // pendingAssignments = [];

        // alert("Schedule saved successfully!");

        // // Refresh the calendar.
        // drawSchedulingEvents();

    } catch (error) {
        console.error("Error saving schedule:", error);
        alert(error.message || "Unable to save the schedule.");
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

//btn listeners
if (createScheduleBtn) {
    createScheduleBtn.addEventListener("click", () => {
        closeOtherPanel("schedule");
        startScheduleMode();
    });
}

if (showCreateShiftsBtn) {
    showCreateShiftsBtn.addEventListener("click", async () => {
        // Hide the Schedule panel
        closeOtherPanel("shift");

        // Show the Create Shifts form immediately
        if (shiftsForm) {
            shiftsForm.style.display = "block";
        }
        // Then load the shift calendar
        await startShiftMode();
    });
}

if (exitScheduleBtn) {
    exitScheduleBtn.addEventListener(
        "click",
        exitScheduleMode
    );
}

if (exitCreateShifts){
    exitCreateShifts.addEventListener(
        "click",
        exitShiftMode
    );
}

const saveScheduleBtn = document.getElementById("saveScheduleBtn");

if (saveScheduleBtn) {
    saveScheduleBtn.addEventListener("click", saveSchedule);
}