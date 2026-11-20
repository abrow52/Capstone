import { db } from "./firebase.js";

import {collection, getDocs, getDoc, doc, writeBatch, runTransaction} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import moment from "https://cdn.jsdelivr.net/npm/moment@2.30.1/+esm";

let getAvailableShifts;
let getSavedAssignments;
let getShiftMode;
let drawAvailableShiftEvents;
let timeToMinutes;
let formatShiftTime;
let getShiftKey;
let shiftsForm;
let hideFormCallback;
let setAvailableShiftsCallback;

let editingShiftID = null;
let editingShiftDate = null;

export function initializeShiftManagement(options) {
    getAvailableShifts = options.getAvailableShifts;
    getSavedAssignments = options.getSavedAssignments;
    getShiftMode = options.getShiftMode;
    drawAvailableShiftEvents = options.drawAvailableShiftEvents;
    timeToMinutes = options.timeToMinutes;
    formatShiftTime = options.formatShiftTime;
    getShiftKey = options.getShiftKey;
    shiftsForm = options.shiftsForm;
    hideFormCallback = options.hideForm;
    setAvailableShiftsCallback = options.setAvailableShifts;
}

const editScopeContainer = document.getElementById("editScopeContainer");
const deleteScopeContainer = document.getElementById("deleteScopeContainer");
const deleteScopeSelect = document.getElementById("deleteScope");
const editScopeSelect = document.getElementById("editScope");

//safegaurd
async function updateShiftAndCheckAssignments(
    shiftIDs,
    startTime,
    endTime,
    startDate,
    endDate) {

    const shiftRefs = shiftIDs.map(shiftID => ({
        id: shiftID,
        ref: doc(db, "shifts", shiftID)
    }));

    const shiftRefByPath = new Map(
        shiftRefs.map(item => [item.ref.path, item])
    );

    // Load schedules and use approved availability records
    const [scheduleSnapshot, availabilitySnapshot] = await Promise.all([
        getDocs(collection(db, "schedule")),
        getDocs(collection(db, "availability"))
    ]);

    const availabilityRecords = availabilitySnapshot.docs.map(
        availabilityDoc => availabilityDoc.data()
    );

    const weekdayOffsets = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
    };

    const newShiftStart = timeToMinutes(startTime);
    const newShiftEnd = timeToMinutes(endTime);

    const invalidAssignments = [];

    // Find every scheduled occurrence of this shift
    for (const scheduleDoc of scheduleSnapshot.docs) {
        const scheduleData = scheduleDoc.data();

        const weeklySchedule =
            scheduleData.schedule || scheduleData["schedule "] || {};

        const weekStart = moment(
            scheduleData.scheduleID || scheduleDoc.id,
            "YYYY-MM-DD",
            true
        );

        if (!weekStart.isValid()) continue;

        for (const [dayName, offset] of Object.entries(weekdayOffsets)) {
            const shiftDate = weekStart.clone().add(offset, "days");
            const daySchedule = weeklySchedule[dayName] || {};

            for (const [slotName, slot] of Object.entries(daySchedule)) {
                const matchedShift = slot?.ShiftID
                    ? shiftRefByPath.get(slot.ShiftID.path)
                    : null;

                if (!matchedShift || !slot.Associate) {
                    continue;
                }

                const dateString = shiftDate.format("YYYY-MM-DD");

                // Check whether this scheduled date is still inside the edited shift's date range
                const dateIsValid =
                    (!startDate || dateString >= startDate) &&
                    (!endDate || dateString <= endDate);

                // Find the employee's latest approved availability active on this date
                const effectiveRecords = availabilityRecords
                    .filter(record =>
                        record.id?.path === slot.Associate.path
                    )
                    .map(record => {
                        const effectiveDate = record.StartDate?.toDate
                            ? moment(record.StartDate.toDate())
                            : moment(record.StartDate);

                        return {
                            record,
                            effectiveDate
                        };
                    })
                    .filter(item => {
                        const effectiveDate = moment(item.effectiveDate);
                        const scheduledDate = moment(shiftDate);
                    
                        return (
                            effectiveDate.isValid() &&
                            effectiveDate.format("YYYY-MM-DD") <=
                                scheduledDate.format("YYYY-MM-DD")
                        );
                    })
                    .sort((a, b) =>
                        b.effectiveDate.valueOf() -
                        a.effectiveDate.valueOf()
                    );

                const effectiveAvailability =
                    effectiveRecords[0]?.record;

                const dayAvailability =
                    effectiveAvailability?.DayTimeAvail?.[dayName];

                const availableStart = timeToMinutes(
                    dayAvailability?.StartTime
                );

                const availableEnd = timeToMinutes(
                    dayAvailability?.EndTime
                );

                // Employee must cover the entire length of the edited shift
                const availabilityIsValid =
                    availableStart !== null &&
                    availableEnd !== null &&
                    newShiftStart !== null &&
                    newShiftEnd !== null &&
                    newShiftEnd > newShiftStart &&
                    availableStart <= newShiftStart &&
                    availableEnd >= newShiftEnd;

                if (!dateIsValid || !availabilityIsValid) {
                    invalidAssignments.push({
                        shiftID: matchedShift.id,
                        scheduleID: scheduleDoc.id,
                        scheduleRef: doc(db, "schedule", scheduleDoc.id),
                        weeklySchedule,
                        scheduleField: scheduleData.schedule
                            ? "schedule"
                            : scheduleData["schedule "]
                                ? "schedule "
                                : "schedule",
                        dayName,
                        slotName,
                        employeeRef: slot.Associate,
                        date: shiftDate.clone()
                    });
                }
            }
        }
    }

    // get employee names
    const namedAssignments = await Promise.all(
        invalidAssignments.map(async assignment => {
            const employeeDoc = await getDoc(assignment.employeeRef);

            return {
                ...assignment,
                employeeName: employeeDoc.exists()
                    ? employeeDoc.data().Name || assignment.employeeRef.id
                    : assignment.employeeRef.id
            };
        })
    );

    // send warning before removing any assignments
    if (namedAssignments.length > 0) {
        const assignmentList = namedAssignments.map(assignment =>
            `• ${assignment.employeeName} — ${assignment.date.format("MMM D, YYYY")}`
        ).join("\n");

        const confirmed = window.confirm(
            `Changing this shift will make ${namedAssignments.length} ` +
            `existing assignment(s) invalid.\n\n` +
            `These employees will be unassigned:\n\n` +
            `${assignmentList}\n\n` +
            `Do you want to continue?`
        );

        if (!confirmed) {
            return null;
        }
    }

    // Prepare updated weekly schedule documents
    const scheduleChanges = new Map();

    for (const assignment of namedAssignments) {
        let change = scheduleChanges.get(assignment.scheduleID);

        if (!change) {
            change = {
                ref: assignment.scheduleRef,
                field: assignment.scheduleField,
                originalSchedule: assignment.weeklySchedule,
                updatedSchedule: { ...assignment.weeklySchedule },
                clonedDays: new Set()
            };

            scheduleChanges.set(assignment.scheduleID, change);
        }

        // Clone each weekday object before changing it
        if (!change.clonedDays.has(assignment.dayName)) {
            change.updatedSchedule[assignment.dayName] = {
                ...(assignment.weeklySchedule[assignment.dayName] || {})
            };

            change.clonedDays.add(assignment.dayName);
        }

        delete change.updatedSchedule[assignment.dayName][
            assignment.slotName
        ];

        // Remove the weekday if no shift slots remain
        if (
            Object.keys(
                change.updatedSchedule[assignment.dayName]
            ).length === 0
        ) {
            delete change.updatedSchedule[assignment.dayName];
        }
    }

    // Save the shift and schedule changes
    let batch = writeBatch(db);
    let writeCount = 0;

    console.log(
        "Firestore shift documents being updated:",
        shiftRefs.map(item => item.ref.path)
    );
    for (const shift of shiftRefs) {
        if (writeCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }
    
        batch.update(shift.ref, {
            ShiftTime: {
                StartTime: startTime,
                EndTime: endTime
            },
            ShiftDate: {
                StartDate: startDate,
                EndDate: endDate || null
            }
        });
    
        writeCount++;
    }

    for (const change of scheduleChanges.values()) {
        if (writeCount >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            writeCount = 0;
        }

        batch.update(change.ref, {
            [change.field]: change.updatedSchedule
        });

        writeCount++;
    }

    if (writeCount > 0) {
        await batch.commit();
    }

    return namedAssignments;
}

//remove the shift from its reoccurring template and make new one (for changes to a single shift date)
async function createNumberedSingleShiftOccurrence(
    shiftID,
    selectedDate,
    startTime,
    endTime
) {
    const originalShiftRef = doc(db, "shifts", shiftID);

    const [
        originalSnapshot,
        scheduleSnapshot,
        availabilitySnapshot,
        shiftsSnapshot
    ] = await Promise.all([
        getDoc(originalShiftRef),
        getDocs(collection(db, "schedule")),
        getDocs(collection(db, "availability")),
        getDocs(collection(db, "shifts"))
    ]);

    if (!originalSnapshot.exists()) {
        throw new Error("The original shift template could not be found.");
    }

    const originalData = originalSnapshot.data();
    const excludedDates = originalData.ExcludedDates || [];

    const selectedMoment = moment(selectedDate, "YYYY-MM-DD", true);

    if (!selectedMoment.isValid()) {
        throw new Error("The selected shift date is invalid.");
    }

    if (
        timeToMinutes(startTime) === null ||
        timeToMinutes(endTime) === null ||
        timeToMinutes(endTime) <= timeToMinutes(startTime)
    ) {
        throw new Error("Please enter a valid start and end time.");
    }

    const [dayCode, shiftCode] = shiftID.split(":");

    if (!dayCode || !shiftCode) {
        throw new Error("The selected shift ID is not in the expected format.");
    }

    const selectedDayName = selectedMoment.format("dddd");

    const counterID = `${dayCode}_${shiftCode}`;
    const counterRef = doc(db, "shiftCounters", counterID);

    //find the highest number of the shift type (ex. Mon:N:4)
    const highestExistingNumber = shiftsSnapshot.docs.reduce(
        (highest, shiftDoc) => {
            const parts = shiftDoc.id.split(":");

            if (
                parts.length !== 3 ||
                parts[0] !== dayCode ||
                parts[1] !== shiftCode ||
                !/^\d+$/.test(parts[2])
            ) {
                return highest;
            }

            return Math.max(highest, Number(parts[2]));
        },
        0
    );

    const availabilityRecords = availabilitySnapshot.docs.map(
        availabilityDoc => availabilityDoc.data()
    );

    const weekdayOffsets = {
        Sunday: 0,
        Monday: 1,
        Tuesday: 2,
        Wednesday: 3,
        Thursday: 4,
        Friday: 5,
        Saturday: 6
    };

    const scheduleChanges = [];
    const unassignedAssignments = [];
    const migratedAssignments = [];
    const migratedScheduleSlots = [];

    //get the date
    for (const scheduleDoc of scheduleSnapshot.docs) {
        const scheduleData = scheduleDoc.data();

        const weekStart = moment(
            scheduleData.scheduleID || scheduleDoc.id,
            "YYYY-MM-DD",
            true
        );

        if (!weekStart.isValid()) continue;

        const scheduleDate = weekStart.clone().add(
            weekdayOffsets[selectedDayName],
            "days"
        );

        if (!scheduleDate.isSame(selectedMoment, "day")) {
            continue;
        }

        const scheduleField = scheduleData.schedule
            ? "schedule"
            : scheduleData["schedule "]
                ? "schedule "
                : "schedule";

        const weeklySchedule = scheduleData[scheduleField] || {};
        const daySchedule = weeklySchedule[selectedDayName] || {};

        const matchingSlots = Object.entries(daySchedule).filter(
            ([slotName, slot]) =>
                slot?.ShiftID?.path === originalShiftRef.path
        );

        if (matchingSlots.length === 0) continue;

        const updatedDay = { ...daySchedule };

        for (const [slotName, slot] of matchingSlots) {
            if (!slot.Associate) {
                updatedDay[slotName] = { ...slot };
            
                migratedScheduleSlots.push({
                    scheduleID: scheduleDoc.id,
                    slotName
                });
            
                continue;
            }

            // check employees availability
            const effectiveRecords = availabilityRecords
                .filter(record =>
                    record.id?.path === slot.Associate.path
                )
                .map(record => {
                    const effectiveDate = record.StartDate?.toDate
                        ? moment(record.StartDate.toDate())
                        : moment(record.StartDate);

                    return { record, effectiveDate };
                })
                .filter(item =>
                    item.effectiveDate.isValid() &&
                    item.effectiveDate.format("YYYY-MM-DD") <=
                        selectedMoment.format("YYYY-MM-DD")
                )
                .sort((a, b) =>
                    b.effectiveDate.valueOf() -
                    a.effectiveDate.valueOf()
                );

            const effectiveAvailability = effectiveRecords[0]?.record;

            const dayAvailability =
                effectiveAvailability?.DayTimeAvail?.[selectedDayName];

            const availableStart = timeToMinutes(
                dayAvailability?.StartTime
            );

            const availableEnd = timeToMinutes(
                dayAvailability?.EndTime
            );

            const newStart = timeToMinutes(startTime);
            const newEnd = timeToMinutes(endTime);

            const availabilityIsValid =
                Number.isFinite(availableStart) &&
                Number.isFinite(availableEnd) &&
                Number.isFinite(newStart) &&
                Number.isFinite(newEnd) &&
                newEnd > newStart &&
                availableStart <= newStart &&
                availableEnd >= newEnd;

            const employeeDoc = await getDoc(slot.Associate);

            const employeeName = employeeDoc.exists()
                ? employeeDoc.data().Name || slot.Associate.id
                : slot.Associate.id;

            if (availabilityIsValid) {
                updatedDay[slotName] = { ...slot };

                migratedScheduleSlots.push({
                    scheduleID: scheduleDoc.id,
                    slotName
                });

                migratedAssignments.push({
                    employeeID: slot.Associate.id,
                    employeeName,
                    date: selectedMoment.clone()
                });
            } else {
                delete updatedDay[slotName];

                unassignedAssignments.push({
                    employeeID: slot.Associate.id,
                    employeeName,
                    date: selectedMoment.clone()
                });
            }
        }

        const updatedWeeklySchedule = { ...weeklySchedule };

        if (Object.keys(updatedDay).length > 0) {
            updatedWeeklySchedule[selectedDayName] = updatedDay;
        } else {
            delete updatedWeeklySchedule[selectedDayName];
        }

        scheduleChanges.push({
            ref: doc(db, "schedule", scheduleDoc.id),
            field: scheduleField,
            updatedSchedule: updatedWeeklySchedule
        });
    }

    // send warning about possible assignee removal
    if (unassignedAssignments.length > 0) {
        const assignmentList = unassignedAssignments.map(assignment =>
            `• ${assignment.employeeName} — ${assignment.date.format("MMM D, YYYY")}`
        ).join("\n");

        const confirmed = window.confirm(
            `The edited shift will no longer fit the approved availability of:\n\n` +
            `${assignmentList}\n\n` +
            `These employees will be unassigned from this date. Continue?`
        );

        if (!confirmed) {
            return null;
        }
    }

    const nextNumber = await runTransaction(db, async transaction => {
        const counterSnapshot = await transaction.get(counterRef);

        const counterNumber = counterSnapshot.exists()
            ? Number(counterSnapshot.data().count) || 0
            : 0;

        const next = Math.max(
            counterNumber,
            highestExistingNumber
        ) + 1;

        transaction.set(counterRef, { count: next });

        return next;
    });

    const newShiftID = `${dayCode}:${shiftCode}:${nextNumber}`;
    const newShiftRef = doc(db, "shifts", newShiftID);

    for (const change of scheduleChanges) {
        const daySchedule = change.updatedSchedule[selectedDayName];

        if (!daySchedule) continue;

        const slotsToMigrate = migratedScheduleSlots.filter(
            slot => slot.scheduleID === change.ref.id
        );

        for (const slot of slotsToMigrate) {
            if (daySchedule[slot.slotName]) {
                daySchedule[slot.slotName] = {
                    ...daySchedule[slot.slotName],
                    ShiftID: newShiftRef
                };
            }
        }
    }

    //save new shift and update data
    const batch = writeBatch(db);

    batch.set(newShiftRef, {
        ShiftTime: {
            StartTime: startTime,
            EndTime: endTime
        },
        ShiftDate: {
            StartDate: selectedDate,
            EndDate: selectedDate
        }
    });

    batch.update(originalShiftRef, {
        ExcludedDates: [
            ...new Set([...excludedDates, selectedDate])
        ]
    });

    for (const change of scheduleChanges) {
        batch.update(change.ref, {
            [change.field]: change.updatedSchedule
        });
    }

    await batch.commit();

    return {
        newShiftID,
        unassignedAssignments,
        migratedAssignments
    };
}

async function deleteShiftAndAssignments(shiftID, selectedDate, scope = "single") {
    const shiftRef = doc(db, "shifts", shiftID);

    try {
        const savedAssignments = getSavedAssignments();
        const shiftDoc = await getDoc(shiftRef);

        if (!shiftDoc.exists()) {
            alert("This shift could not be found.");
            return false;
        }

        const shiftData = shiftDoc.data();

        const isDateSpecificShift =
        shiftData.ShiftDate?.StartDate &&
        shiftData.ShiftDate?.EndDate &&
        shiftData.ShiftDate.StartDate ===
            shiftData.ShiftDate.EndDate;

        const isStandaloneShift = isDateSpecificShift;

        const deleteAll = scope === "all" && !isStandaloneShift;

        const scheduleSnapshot = await getDocs(
            collection(db, "schedule")
        );

        const weekdayOffsets = {
            Sunday: 0,
            Monday: 1,
            Tuesday: 2,
            Wednesday: 3,
            Thursday: 4,
            Friday: 5,
            Saturday: 6
        };

        const scheduleChanges = new Map();
        const assignedEmployees = [];
        const removedDates = new Set();

        // Find the schedules that should be removed
        for (const scheduleDoc of scheduleSnapshot.docs) {
            const scheduleData = scheduleDoc.data();

            const weeklySchedule =
                scheduleData.schedule ||
                scheduleData["schedule "] ||
                {};

            const weekStart = moment(
                scheduleData.scheduleID || scheduleDoc.id,
                "YYYY-MM-DD",
                true
            );

            if (!weekStart.isValid()) continue;

            let updatedSchedule = { ...weeklySchedule };
            let scheduleChanged = false;

            for (const [dayName, offset] of Object.entries(weekdayOffsets)) {
                const daySchedule = weeklySchedule[dayName];

                if (!daySchedule) continue;

                const shiftDate = weekStart.clone().add(offset, "days");
                const shiftDateString = shiftDate.format("YYYY-MM-DD");

                // For a single-date deletion, only remove the selected date
                if (!deleteAll && shiftDateString !== selectedDate) {
                    continue;
                }

                const matchingSlots = Object.entries(daySchedule)
                    .filter(([slotName, slot]) =>
                        slot?.ShiftID?.path === shiftRef.path
                    );

                if (matchingSlots.length === 0) continue;

                updatedSchedule[dayName] = { ...daySchedule };

                for (const [slotName, slot] of matchingSlots) {
                    if (slot.Associate) {
                        assignedEmployees.push({
                            employeeRef: slot.Associate,
                            date: shiftDate.clone()
                        });
                    }

                    delete updatedSchedule[dayName][slotName];
                    scheduleChanged = true;
                }

                removedDates.add(shiftDateString);

                if (Object.keys(updatedSchedule[dayName]).length === 0) {
                    delete updatedSchedule[dayName];
                }
            }

            if (scheduleChanged) {
                scheduleChanges.set(scheduleDoc.id, {
                    ref: doc(db, "schedule", scheduleDoc.id),
                    field: scheduleData.schedule
                        ? "schedule"
                        : scheduleData["schedule "]
                            ? "schedule "
                            : "schedule",
                    updatedSchedule
                });
            }
        }

        // get employee names
        const namedAssignments = await Promise.all(
            assignedEmployees.map(async assignment => {
                const employeeDoc = await getDoc(assignment.employeeRef);

                return {
                    ...assignment,
                    employeeName: employeeDoc.exists()
                        ? employeeDoc.data().Name ||
                            assignment.employeeRef.id
                        : assignment.employeeRef.id
                };
            })
        );

        const assignmentList = namedAssignments.length > 0
            ? namedAssignments.map(assignment =>
                `• ${assignment.employeeName} — ${assignment.date.format("MMM D, YYYY")}`
            ).join("\n")
            : "There are no assigned employees.";

        let confirmationMessage;

        if (deleteAll) {
            confirmationMessage =
                `This will delete all shifts on this day of the week at this time.`;
        } else {
            confirmationMessage =
                `This will remove only the shift on ${moment(selectedDate).format("MMM D, YYYY")}.`;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete shift ${shiftID}?\n\n` +
            `${confirmationMessage}\n\n` +
            `Employees who will be unassigned:\n${assignmentList}\n\n` +
            `This action cannot be undone. Continue?`
        );

        if (!confirmed) return false;

        // Apply the deletion and schedule changes
        let batch = writeBatch(db);
        let writeCount = 0;

        if (deleteAll || isStandaloneShift) {
            batch.delete(shiftRef);
            writeCount++;
        } else {
            const excludedDates = shiftData.ExcludedDates || [];

            if (!excludedDates.includes(selectedDate)) {
                batch.update(shiftRef, {
                    ExcludedDates: [...excludedDates, selectedDate]
                });
                writeCount++;
            }
        }

        for (const change of scheduleChanges.values()) {
            if (writeCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                writeCount = 0;
            }

            batch.update(change.ref, {
                [change.field]: change.updatedSchedule
            });

            writeCount++;
        }

        if (writeCount > 0) {
            await batch.commit();
        }

        if (deleteAll) {
            namedAssignments.forEach(assignment => {
                savedAssignments.delete(
                    getShiftKey(shiftID, assignment.date)
                );
            });
        } else {
            savedAssignments.delete(
                getShiftKey(shiftID, moment(selectedDate))
            );
        }

        const shiftsSnapshot = await getDocs(collection(db, "shifts"));


        const updatedShifts = shiftsSnapshot.docs.map(shiftDoc => ({
            id: shiftDoc.id,
            shiftTime: shiftDoc.data().ShiftTime,
            shiftDate: shiftDoc.data().ShiftDate || {},
            excludedDates: shiftDoc.data().ExcludedDates || []
        }));
        
        setAvailableShiftsCallback(updatedShifts);

        drawAvailableShiftEvents();

        return true;

    } catch (error) {
        console.error("Error deleting shift:", error);
        alert("Unable to delete this shift. Please try again.");
        return false;
    }
}

export async function handleShiftEditSubmit({
    startTime,
    endTime,
    startDate,
    endDate
}) {
    if (!editingShiftID) {
        return false;
    }

    try {
        const availableShifts = getAvailableShifts();
        const savedAssignments = getSavedAssignments();
        const shiftIDBeingEdited = editingShiftID;

        const selectedShift = availableShifts.find(
            shift => shift.id === shiftIDBeingEdited
        );

        if (!selectedShift) {
            alert("Unable to find the selected shift.");
            return true;
        }

        let targetShiftIDs = [shiftIDBeingEdited];

        if (editScopeSelect?.value === "matching") {
            const selectedParts = selectedShift.id.split(":");
            const originalStart = selectedShift.shiftTime.StartTime;
            const originalEnd = selectedShift.shiftTime.EndTime;

            targetShiftIDs = availableShifts
                .filter(shift => {
                    const parts = shift.id.split(":");

                    return (
                        parts.length === 3 &&
                        selectedParts.length === 3 &&
                        parts[0] === selectedParts[0] &&
                        parts[1] === selectedParts[1] &&
                        shift.shiftTime?.StartTime === originalStart &&
                        shift.shiftTime?.EndTime === originalEnd
                    );
                })
                .map(shift => shift.id);
        }

        let unassignedEmployees;
        const isSingleEdit = editScopeSelect?.value !== "matching";

        const isDateSpecificShift =
            selectedShift.shiftDate?.StartDate &&
            selectedShift.shiftDate?.EndDate &&
            selectedShift.shiftDate.StartDate ===
                selectedShift.shiftDate.EndDate;

        if (isSingleEdit && !isDateSpecificShift) {
            const result = await createNumberedSingleShiftOccurrence(
                shiftIDBeingEdited,
                editingShiftDate,
                startTime,
                endTime
            );

            if (result === null) {
                return true;
            }

            unassignedEmployees = result.unassignedAssignments;

            result.migratedAssignments.forEach(assignment => {
                savedAssignments.delete(
                    getShiftKey(shiftIDBeingEdited, assignment.date)
                );

                savedAssignments.set(
                    getShiftKey(result.newShiftID, assignment.date),
                    {
                        employeeID: assignment.employeeID,
                        employeeName: assignment.employeeName
                    }
                );
            });

            unassignedEmployees.forEach(assignment => {
                savedAssignments.delete(
                    getShiftKey(shiftIDBeingEdited, assignment.date)
                );
            });

        } else {
            const unassignedResult =
                await updateShiftAndCheckAssignments(
                    targetShiftIDs,
                    startTime,
                    endTime,
                    startDate,
                    endDate
                );

            if (unassignedResult === null) {
                return true;
            }

            unassignedEmployees = unassignedResult;

            unassignedEmployees.forEach(assignment => {
                savedAssignments.delete(
                    getShiftKey(assignment.shiftID, assignment.date)
                );
            });
        }

        alert(
            targetShiftIDs.length > 1
                ? `${targetShiftIDs.length} matching shifts updated successfully!`
                : "Shift updated successfully!"
        );

        const snapshot = await getDocs(collection(db, "shifts"));

        const updatedShifts = snapshot.docs.map(shiftDoc => ({
            id: shiftDoc.id,
            shiftTime: shiftDoc.data().ShiftTime,
            shiftDate: shiftDoc.data().ShiftDate || {},
            excludedDates: shiftDoc.data().ExcludedDates || []
        }));

        // update the shifts array in shifts.js
        setAvailableShiftsCallback(updatedShifts);

        if (getShiftMode()) {
            drawAvailableShiftEvents();
        }

        hideFormCallback();

        return true;

    } catch (error) {
        console.error("Error editing shift:", error);
        alert("Unable to update the shift. Please try again.");
        return true;
    }
}

function openShiftForEditing(shiftEvent) {
    const shift = getAvailableShifts().find(
        item => item.id === shiftEvent.shiftID
    );

    if (!shift) {
        alert("Unable to find the selected shift.");
        return;
    }

    editingShiftID = shift.id;
    editingShiftDate = shiftEvent.date.format("YYYY-MM-DD");
    if (editScopeContainer) {
        editScopeContainer.style.display = "block";
    }
    
    if (editScopeSelect) {
        editScopeSelect.value = "single";
    }

    const shiftParts = shift.id.split(":");

    const dayNames = {
        Sun: "Sunday",
        Mon: "Monday",
        Tue: "Tuesday",
        Wed: "Wednesday",
        Thu: "Thursday",
        Fri: "Friday",
        Sat: "Saturday"
    };

    const typeNames = {
        M: "Morning",
        E: "Evening",
        N: "Night"
    };

    document.getElementById("shiftType").value =
        typeNames[shiftParts[1]];

    document.getElementById("startTime").value =
        shift.shiftTime.StartTime;

    document.getElementById("endTime").value =
        shift.shiftTime.EndTime;

    document.getElementById("shiftStartDate").value =
        shift.shiftDate.StartDate || "";

    document.getElementById("shiftEndDate").value =
        shift.shiftDate.EndDate || "";

    // Select the weekday from the shift id
    document.querySelectorAll('input[name="shiftDays"]').forEach(checkbox => {
        checkbox.checked = checkbox.value === dayNames[shiftParts[0]];
        checkbox.disabled = true;
    });

    document.getElementById("shiftType").disabled = true;
    document.getElementById("shiftQuantity").disabled = true;

    shiftsForm.querySelector('button[type="submit"]').textContent =
        "Save Changes";

    shiftsForm.style.display = "block";
}

// select a shift for editing
window.selectShiftForEditing = function(shiftEvent) {
    if (!getShiftMode()) return;

    const panel = document.getElementById("shiftManagementPanel");
    const details = document.getElementById("selectedManagedShiftDetails");

    if (!panel || !details) return;

    panel.style.display = "block";

    const selectedDate = shiftEvent.date.clone();

    details.innerHTML = `
        <h5>Selected Shift</h5>
        <p><strong>Type:</strong> ${shiftEvent.shiftType}</p>
        <p><strong>Date:</strong> ${selectedDate.format("dddd, MMMM D, YYYY")}</p>
        <p><strong>Start Time:</strong> ${formatShiftTime(shiftEvent.shiftStart)}</p>
        <p><strong>End Time:</strong> ${formatShiftTime(shiftEvent.shiftEnd)}</p>
    `;

    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.textContent = "Edit Shift";

    editButton.addEventListener("click", () => {
        openShiftForEditing(shiftEvent);
    });

    details.appendChild(editButton);


    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.textContent = "Delete Shift";

    
    let deleteOptionsShown = false;

    deleteButton.addEventListener("click", async () => {

        // First click: reveal the deletion options
        if (!deleteOptionsShown) {
            if (deleteScopeContainer) {
                deleteScopeContainer.style.display = "block";
            }

            if (deleteScopeSelect) {
                deleteScopeSelect.value = "single";
            }

            deleteButton.textContent = "Confirm Delete";
            deleteOptionsShown = true;
            return;
        }

        // Second click: use the manager's selected option
        const scope = deleteScopeSelect
            ? deleteScopeSelect.value
            : "single";

        console.log("Selected deletion scope:", scope);

        const deleted = await deleteShiftAndAssignments(
            shiftEvent.shiftID,
            shiftEvent.date.format("YYYY-MM-DD"),
            scope
        );

        if (deleted) {
            if (deleteScopeContainer) {
                deleteScopeContainer.style.display = "none";
            }

            if (deleteScopeSelect) {
                deleteScopeSelect.value = "single";
            }

            details.innerHTML = "";
        }
    });


    details.appendChild(deleteButton);

};