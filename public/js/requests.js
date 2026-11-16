import { db } from "./firebase.js";
import {collection, doc, setDoc, getDocs, getDoc, where, query, addDoc, deleteDoc, writeBatch} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { loadOpenShifts } from "./calendar.js";
import { formatShiftTime } from "./shifts.js";

const currentUserID = sessionStorage.getItem("userID");
const currentUserName = sessionStorage.getItem("Name");
const currentTitle = sessionStorage.getItem("Title");

async function loadUserRequests() {
    const currentUserID = sessionStorage.getItem("userID");

    if (!currentUserID) {
        console.error("No logged-in user found.");
        return;
    }

    const pendingDiv = document.getElementById("pendingReqs");
    const approvedDiv = document.getElementById("approvedReqs");
    const deniedDiv = document.getElementById("deniedReqs");

    pendingDiv.innerHTML = "";
    approvedDiv.innerHTML = "";
    deniedDiv.innerHTML = "";

    try {
        // will need to change for manager view so they can see other employees requests
        const requestsQuery = query(
            collection(db, "Requests"),
            where("requester", "==", currentUserID)
        );

        const snapshot = await getDocs(requestsQuery);

        if (snapshot.empty) {
            pendingDiv.textContent = "You have no requests yet.";
            return;
        }

        snapshot.forEach((requestDoc) => {
            const request = requestDoc.data();

            const requestCard = document.createElement("div");
            requestCard.classList.add("request-card");

            if (request.reqType === "dropShift") {
                const details = document.createElement("p");
            
                details.textContent =
                    `Drop Shift: ${request.Date} — ` +
                    `${formatShiftTime(request.StartTime)} to ${formatShiftTime(request.EndTime)}`;
            
                requestCard.appendChild(details);
            
            } else {
                const leaveType = document.createElement("p");
                leaveType.textContent =
                    "Leave type: " + (request.leaveType || "N/A");
            
                const dates = document.createElement("p");
                dates.textContent =
                    "Dates: " + (request.startDate || "N/A") +
                    " to " + (request.endDate || "N/A");
            
                requestCard.appendChild(leaveType);
                requestCard.appendChild(dates);
            }

            if (request.status === "pending") {
                pendingDiv.appendChild(requestCard);
            } else if (request.status === "approved") {
                approvedDiv.appendChild(requestCard);
            } else if (request.status === "denied") {
                deniedDiv.appendChild(requestCard);
            }
        });

        if (!pendingDiv.hasChildNodes()) {
            pendingDiv.textContent = "No pending requests.";
        }

        if (!approvedDiv.hasChildNodes()) {
            approvedDiv.textContent = "No approved requests.";
        }

        if (!deniedDiv.hasChildNodes()) {
            deniedDiv.textContent = "No denied requests.";
        }

    } catch (error) {
        console.error("Error loading requests:", error);
    }
}


const reqTimeOffForm = document.getElementById("reqTimeOffForm");
//time off
reqTimeOffForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const currentUserID = sessionStorage.getItem("userID");
    if (!currentUserID) {
        alert("You must be logged in to submit a time-off request.");
        return;
    }

    const leaveType = document.getElementById("leaveType").value.trim();
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;

    try {
        // make a new doc
        const requestRef = doc(collection(db, "Requests"));
    
        await setDoc(requestRef, {
            status: "pending",
            reqType: "timeOff",
            requester: currentUserID,
            leaveType: leaveType,
            startDate: startDate,
            endDate: endDate,
        });
    
        alert("request submitted successfully!");
        reqTimeOffForm.reset();
        reqTimeOffForm.style.display = "none";
        await loadUserRequests();
    
    } catch (error) {
        alert("Failed to add user: " + error.message);
    }
});

//drop shift
const dropShiftForm = document.getElementById("reqDropShiftForm");
const assignedShiftsDiv = document.getElementById("myAssignedShifts");

const showDropShiftButton = document.getElementById("showDropShiftForm");
const showTimeOffButton = document.getElementById("showTimeOffForm");
const cancelDropShiftButton = document.getElementById("cancelDropShift");
const cancelTimeOffButton = document.getElementById("cancelTimeOff");

let employeeShifts = [];

showDropShiftButton.addEventListener("click", async () => {
    document.getElementById("reqTimeOffForm").style.display = "none";
    dropShiftForm.style.display = "block";

    await loadEmployeeShifts();
});

showTimeOffButton.addEventListener("click", async () => {
    document.getElementById("reqDropShiftForm").style.display = "none";
    reqTimeOffForm.style.display = "block";

    await loadEmployeeShifts();
});

cancelDropShiftButton.addEventListener("click", () => {
    dropShiftForm.style.display = "none";
    dropShiftForm.reset();
});

cancelTimeOffButton.addEventListener("click", () => {
    reqTimeOffForm.style.display = "none";
    reqTimeOffForm.reset();
});

async function loadEmployeeShifts() {
    const userID = sessionStorage.getItem("userID");

    assignedShiftsDiv.innerHTML = "Loading your shifts...";
    employeeShifts = [];

    if (!userID) {
        assignedShiftsDiv.textContent = "You must be logged in.";
        return;
    }

    try {
        const scheduleSnapshot = await getDocs(
            collection(db, "schedule")
        );

        const weekdays = [
            "Sunday",
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday"
        ];

        const employeeRef = doc(db, "userInfo", userID);

        for (const scheduleDoc of scheduleSnapshot.docs) {
            const scheduleData = scheduleDoc.data();

            // The scheduleID represents the Sunday of that schedule week.
            const weekStart = scheduleData.scheduleID || scheduleDoc.id;

            const weekDate = new Date(weekStart + "T12:00:00");

            if (Number.isNaN(weekDate.getTime())) {
                continue;
            }

            const weeklySchedule = scheduleData.schedule || {};

            for (let dayIndex = 0; dayIndex < weekdays.length; dayIndex++) {
                const weekday = weekdays[dayIndex];

                const dayShifts = weeklySchedule[weekday] || {};

                for (const [slotName, slot] of Object.entries(dayShifts)) {
                    if (!slot?.Associate || !slot?.ShiftID) {
                        continue;
                    }

                    // Only show shifts assigned to this employee.
                    if (slot.Associate.path !== employeeRef.path) {
                        continue;
                    }

                    const shiftSnapshot = await getDoc(slot.ShiftID);

                    if (!shiftSnapshot.exists()) {
                        continue;
                    }

                    const shiftData = shiftSnapshot.data();

                    const shiftDate = new Date(weekDate);
                    shiftDate.setDate(weekDate.getDate() + dayIndex);

                    const dateString =
                        String(shiftDate.getMonth() + 1).padStart(2, "0") + "/" +
                        String(shiftDate.getDate()).padStart(2, "0") + "/" +
                        shiftDate.getFullYear();

                    employeeShifts.push({
                        date: dateString,
                        weekday: weekday,
                        startTime: shiftData.ShiftTime?.StartTime || "",
                        endTime: shiftData.ShiftTime?.EndTime || "",
                        shiftRef: slot.ShiftID,
                        scheduleID: scheduleDoc.id,
                        slotName: slotName
                    });
                }
            }
        }

        displayEmployeeShifts();

    } catch (error) {
        console.error("Error loading employee shifts:", error);
        assignedShiftsDiv.textContent =
            "Unable to load your assigned shifts.";
    }
}

function displayEmployeeShifts() {
    assignedShiftsDiv.innerHTML = "";

    if (employeeShifts.length === 0) {
        assignedShiftsDiv.textContent =
            "You currently have no assigned shifts to drop.";
        return;
    }

    employeeShifts.forEach((shift, index) => {
        const label = document.createElement("label");
        label.classList.add("drop-shift-option");

        const radio = document.createElement("input");
        radio.type = "radio";
        radio.name = "selectedDropShift";
        radio.value = index;
        radio.required = true;

        const details = document.createElement("span");
        details.textContent =
            `${shift.weekday}, ${shift.date} — ` +
            `${formatShiftTime(shift.startTime)} to ${formatShiftTime(shift.endTime)}`;

        label.appendChild(radio);
        label.appendChild(details);

        assignedShiftsDiv.appendChild(label);
    });
}

dropShiftForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const userID = sessionStorage.getItem("userID");
    const userName = sessionStorage.getItem("Name");

    if (!userID) {
        alert("You must be logged in to submit a drop request.");
        return;
    }

    const selected = document.querySelector(
        'input[name="selectedDropShift"]:checked'
    );

    if (!selected) {
        alert("Please select a shift to drop.");
        return;
    }

    const selectedShift = employeeShifts[Number(selected.value)];

    if (!selectedShift) {
        alert("That shift could not be found. Please try again.");
        return;
    }

    try {
        // Check whether this shift is already in OpenShifts.
        const existingOpenShift = await getDocs(
            query(
                collection(db, "OpenShifts"),
                where("Date", "==", selectedShift.date),
                where("shiftID", "==", selectedShift.shiftRef)
            )
        );
    
        // Create references for the new documents.
        const requestRef = doc(collection(db, "Requests")); //appears on home page 
        // const requestRef = doc(collection(db, "ShiftRequests")); //appears on request page 
    
        const batch = writeBatch(db);
    
        // Save the employee's drop request.
        batch.set(requestRef, {
            reqType: "dropShift",
            requester: userID,
            Name: userName || "",
            status: "pending",
    
            shiftID: selectedShift.shiftRef,
            Date: selectedShift.date,
            StartTime: selectedShift.startTime,
            EndTime: selectedShift.endTime,
    
            // scheduleID: selectedShift.scheduleID,
    
            submittedAt: new Date()
        });
    
        // make the shift visible in Open Shifts immediately. (manager can approve a drop req w/o someone picking it up)
        // avoid creating duplicate OpenShifts entries.
        if (existingOpenShift.empty) {
            const openShiftRef = doc(collection(db, "OpenShifts"));
    
            batch.set(openShiftRef, {
                Date: selectedShift.date,
                shiftID: selectedShift.shiftRef
            });
        }
    
        // Save both changes together.
        await batch.commit();
    
        alert("Your drop request was submitted! The shift is now available in Open Shifts.");
    
        dropShiftForm.reset();
        dropShiftForm.style.display = "none";
    
        await loadUserRequests();
        await loadOpenShifts();
    
    } catch (error) {
        console.error("Error submitting drop request:", error);
        alert("Unable to submit your drop request.");
    }
});

//what happens if a request is approved or denied
// reqResponse.addEventListener("submit", async (event) => {
//     
// });

// THIS IS FOR THE PICKUP SHIFT FUNCTIONALITY 
const container = document.getElementById("shiftList");
container.addEventListener("click", async function(event) {

 const button = event.target.closest(".PickUpButton");
    if (!button) return;

        const date = button.dataset.date;
        const startTime = button.dataset.start;
        const endTime = button.dataset.end;
        const openShiftId = button.dataset.openShiftId;
        const shiftId = button.dataset.shiftId;

        const snapshot = await getDocs(collection(db, "ShiftRequests"));

         for (const requestDoc of snapshot.docs) {
            const request = requestDoc.data();
                if (request.Date == openShiftId && request.StartTime == startTime && 
                        request.EndTime == endTime && request.Status == "Pending") {
                    alert("Shift was already requested");
                    return; 
                }
         }

        try {

            await addDoc(collection(db, "ShiftRequests"), {
                UserID: currentUserID,
                Name: currentUserName,
                Date: date,
                StartTime: startTime,
                EndTime: endTime,
                Status: "Pending", 
                shiftID: doc(db, "shifts", shiftId)
            });

            await deleteDoc(doc(db, "OpenShifts", openShiftId));

            button.closest(".shiftInfo").remove();

            alert("Pickup request submitted!");

            button.disabled = true;
            button.textContent = "Requested";

        } catch (error) {

            console.error("Error submitting pickup request:", error);
            alert("Unable to submit pickup request.");

        }
});

loadOpenShifts();
loadUserRequests();