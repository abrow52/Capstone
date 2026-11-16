import { db } from "./firebase.js";

import {collection, getDocs, updateDoc, doc, addDoc, deleteDoc, getDoc, writeBatch} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { formatTime } from "./calendar.js";

//logged-in user information
const currentUserID = sessionStorage.getItem("userID");
const currentUserName = sessionStorage.getItem("Name");
const currentTitle = sessionStorage.getItem("Title");

async function ManagerloadShiftRequests() {

    const snapshot = await getDocs(collection(db, "ShiftRequests"));

    const container = document.getElementById("requestList");

    container.innerHTML = "";

    const template = document.getElementById("requestTemplate");

    for (const requestDoc of snapshot.docs) {

        const request = requestDoc.data();

        const card = template.content.cloneNode(true);

        card.querySelector(".requestName").textContent =
            "Associate: " + request.Name;

        card.querySelector(".requestDate").textContent =
            "Date: " + request.Date;

        card.querySelector(".requestTime").textContent =
            "Time:" + formatTime(request.StartTime) + " - " + formatTime(request.EndTime);

        card.querySelector(".requestStatus").textContent =
            "Status: " + request.Status;

        const approveButton = card.querySelector(".approveButton");
        const denyButton = card.querySelector(".denyButton");

        if (request.Status !== "Pending") {
            approveButton.remove();
            denyButton.remove();
        }

        approveButton.addEventListener("click", async function() {

             try {
                const associateRef = doc(db, "userInfo", request.UserID);

                const shiftRef = typeof request.shiftID === "string"
                    ? doc(db, "shifts", request.shiftID)
                    : request.shiftID;

                // Find which week this shift belongs to
                const weekStart = moment(request.Date, "MM/DD/YYYY")
                    .startOf("week")
                    .format("YYYY-MM-DD");

                // Get that week's schedule document
                const scheduleRef = doc(db, "schedule", weekStart);
                const scheduleSnapshot = await getDoc(scheduleRef);

                if (!scheduleSnapshot.exists()) {
                    alert("The weekly schedule could not be found.");
                    return;
                }

                // Get the weekday name
                const dayName = moment(request.Date, "MM/DD/YYYY").format("dddd");

                // Get that day's shifts
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

                // Add the associate and shift to the weekly schedule
                batch.update(scheduleRef, {
                    [`schedule.${dayName}.${slotName}`]: {
                        Associate: associateRef,
                        ShiftID: shiftRef
                    }
                });

                await updateDoc(doc(db, "ShiftRequests", requestDoc.id), {
                    Status: "Approved"
                });

                await batch.commit();

                alert("Request approved!");

                ManagerloadShiftRequests();

            } catch (error) {
                console.error("Error approving request:", error);
                alert("Unable to approve request.");
            }

        });

        denyButton.addEventListener("click", async function() {

           try {

                await updateDoc(doc(db, "ShiftRequests", requestDoc.id), {
                    Status: "Denied"
                });

                await addDoc(collection(db, "OpenShifts"), {
                        Date: request.Date,
                        shiftID: request.shiftID
                    });

                await deleteDoc(doc(db, "ShiftRequests", requestDoc.id));

                alert("Request denied. Shift is available again!");


                ManagerloadShiftRequests();

            } catch (error) {
                console.error("Error denying request:", error);
                alert("Unable to deny request.");
            }
        });


        container.appendChild(card);
    }
}

ManagerloadShiftRequests();