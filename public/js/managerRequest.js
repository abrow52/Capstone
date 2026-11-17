import { db } from "./firebase.js";

import {collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, writeBatch} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { formatTime } from "./calendar.js";

//logged-in user information
const currentUserID = sessionStorage.getItem("userID");
const currentUserName = sessionStorage.getItem("Name");
const currentTitle = sessionStorage.getItem("Title");

async function ManagerloadShiftRequests() {

    const snapshot = await getDocs(collection(db, "Requests"));

    const container = document.getElementById("requestList");

    container.innerHTML = "";

    const template = document.getElementById("requestTemplate");

    for (const requestDoc of snapshot.docs) {

        const request = requestDoc.data();

        const card = template.content.cloneNode(true);

        console.log("Request type:", request.reqType);
        console.log("Request ID:", requestDoc.id);
        console.log("Request data:", request);

        //different display types for the types of requests
        if (request.reqType === "timeOff") {
            card.querySelector(".requestName").textContent =
                "Associate: " + (request.Name || "Unknown");

        card.querySelector(".requestDate").textContent =
            "Start Date: " + request.startDate;

        card.querySelector(".requestTime").textContent =
            "End Date: " + request.endDate;

        card.querySelector(".requestStatus").textContent =
            "Status: " + request.Status;

        card.querySelector(".leaveType").textContent =
            "Leave Type: " + request.leaveType;

            card.querySelector(".requestType").textContent =
                "Request Type: " + request.reqType;

            
        }
        else {
            card.querySelector(".requestName").textContent =
                "Associate: " + (request.Name || "Unknown");

            card.querySelector(".requestDate").textContent =
                "Date: " + (request.Date || "Unknown");

            card.querySelector(".requestTime").textContent =
                "Time: " + formatTime(request.StartTime) +
                " - " + formatTime(request.EndTime);

            card.querySelector(".requestStatus").textContent =
                "Status: " + request.Status;

            card.querySelector(".requestType").textContent =
            "Request Type: " + request.reqType;
        }

        const approveButton = card.querySelector(".approveButton");
        const denyButton = card.querySelector(".denyButton");

        if (request.Status !== "Pending") {
            approveButton.remove();
            denyButton.remove();
        }

        approveButton.addEventListener("click", async function() {
            try {
                //different functionality for the kind of request 
                if (request.reqType === "pickupShift") {
                    //if it gets approved, this adds it to the schedule
                    const associateRef = doc(db, "userInfo", request.UserID);

                    const shiftRef = typeof request.shiftID === "string"
                        ? doc(db, "shifts", request.shiftID)
                        : request.shiftID;

                    const weekStart = moment(request.Date, "MM/DD/YYYY")
                        .startOf("week")
                        .format("YYYY-MM-DD");

                    const scheduleRef = doc(db, "schedule", weekStart);
                    const scheduleSnapshot = await getDoc(scheduleRef);

                    if (!scheduleSnapshot.exists()) {
                        alert("The weekly schedule could not be found.");
                        return;
                    }

                    const dayName = moment(request.Date, "MM/DD/YYYY").format("dddd");
                    const scheduleData = scheduleSnapshot.data().schedule || {};
                    const daySchedule = scheduleData[dayName] || {};

                    const shiftKeys = Object.keys(daySchedule)
                        .filter(key => /^Shift\d+$/.test(key))
                        .sort((a, b) => Number(a.replace("Shift", "")) - Number(b.replace("Shift", "")));

                    let slotName = shiftKeys.find(key =>
                        !daySchedule[key]?.Associate && !daySchedule[key]?.ShiftID
                    );

                    if (!slotName) {
                        const nextNumber = shiftKeys.length > 0
                            ? Math.max(...shiftKeys.map(key => Number(key.replace("Shift", "")))) + 1
                            : 1;

                        slotName = `Shift${nextNumber}`;
                    }

                    const batch = writeBatch(db);

                    batch.update(scheduleRef, {
                        [`schedule.${dayName}.${slotName}`]: {
                            Associate: associateRef,
                            ShiftID: shiftRef
                        }
                    });

                    batch.update(doc(db, "Requests", requestDoc.id), {
                        Status: "Approved"
                    });

                    await batch.commit();

                    alert("Request approved!");
                    ManagerloadShiftRequests();

                } else if (request.reqType === "dropShift") {
                    ///if its a drop shift request, it adds it to the openshifts db
                    await addDoc(collection(db, "OpenShifts"), {
                        Date: request.Date,
                        shiftID: request.shiftID
                    });

                    await updateDoc(doc(db, "Requests", requestDoc.id), {
                        Status: "Approved"
                    });

                    alert("Request approved!");
                    ManagerloadShiftRequests();

                } else if (request.reqType === "timeOff") {
                    //if its a time-off request, it adds it to the time-off db
                    await addDoc(collection(db, "TimeOff"), {
                        Approved: true,
                        DateSubmitted: new Date(), 
                        EndDayTime: request.endDate,
                        StartDayTime: request.startDate,
                        id: doc(db, "userInfo", request.UserID)
                        });

                    await updateDoc(doc(db, "Requests", requestDoc.id), {
                        Status: "Approved"
                    });

                    alert("Time-off request approved!");

                    ManagerloadShiftRequests();
                }
            } catch (error) {
                console.error("Error approving request:", error);
                alert("Unable to approve request.");
            }
        });

        denyButton.addEventListener("click", async function() {
            try {
                if (request.reqType === "pickupShift") {
                    //if its a pickup shift request, it just changes the status to denied  and readds the shift to the openshifts db
                    await updateDoc(doc(db, "Requests", requestDoc.id), {
                        Status: "Denied"
                    });

                    await addDoc(collection(db, "OpenShifts"), {
                        Date: request.Date,
                        shiftID: request.shiftID
                    });

                    await deleteDoc(doc(db, "Requests", requestDoc.id));

                    alert("Request denied. Shift is available again!");
                    ManagerloadShiftRequests();

                } else if (request.reqType === "dropShift") {
                    //the drop shift request is denied. 
                    await updateDoc(doc(db, "Requests", requestDoc.id), {
                        Status: "Denied"
                    });

                    alert("Request denied.");
                    ManagerloadShiftRequests();
                } else if (request.reqType === "timeOff") {
                    //just changes the status to denied for time-off requests
                    await updateDoc(doc(db, "Requests", requestDoc.id), {
                        Status: "Denied"
                    });

                    alert("Time-off request denied.");

                    ManagerloadShiftRequests();
                }
            } catch (error) {
                console.error("Error denying request:", error);
                alert("Unable to deny request.");
            }
        });

        container.appendChild(card);
    }
}

ManagerloadShiftRequests();