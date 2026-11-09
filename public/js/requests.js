import { db } from "./firebase.js";
import {collection, doc, setDoc, getDocs, where, query, addDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { loadOpenShifts } from "./calendar.js";

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

            const leaveType = document.createElement("p");
            leaveType.textContent =
                "Leave type: " + (request.leaveType || "N/A");

            const dates = document.createElement("p");
            dates.textContent =
                "Dates: " + (request.startDate || "N/A") +
                " to " + (request.endDate || "N/A");

            requestCard.appendChild(leaveType);
            requestCard.appendChild(dates);

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
        // Generate a new user document reference
        const requestRef = doc(collection(db, "Requests"));
    
        // Create the user
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

        const snapshot = await getDocs(collection(db, "ShiftRequests"));

         for (const requestDoc of snapshot.docs) {
            const request = requestDoc.data();
                if(request.shiftID == openShiftId){
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
                shiftID: openShiftId
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
//---------------------------------------

loadOpenShifts();
loadUserRequests();