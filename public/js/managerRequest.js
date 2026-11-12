import { db } from "./firebase.js";

import {collection, getDocs, updateDoc, doc, addDoc, deleteDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
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

                await updateDoc(doc(db, "ShiftRequests", requestDoc.id), {
                    Status: "Approved"
                });

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