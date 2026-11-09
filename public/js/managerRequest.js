import { db } from "./firebase.js";

import {collection, getDocs, updateDoc, doc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

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
            "Time: " + request.StartTime + " - " + request.EndTime;

        card.querySelector(".requestStatus").textContent =
            "Status: " + request.Status;

        const approveButton = card.querySelector(".approveButton");

        approveButton.addEventListener("click", async function() {

            await updateDoc(doc(db, "ShiftRequests", requestDoc.id), {
                Status: "Approved"
            });

            

            loadShiftRequests();
        });



        const denyButton = card.querySelector(".denyButton");

        denyButton.addEventListener("click", async function() {

            await updateDoc(doc(db, "ShiftRequests", requestDoc.id), {
                Status: "Denied"
            });

            loadShiftRequests();
        });


        container.appendChild(card);
    }
}

ManagerloadShiftRequests();