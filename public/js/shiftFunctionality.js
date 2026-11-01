import { db } from "./firebase.js";

import {collection, getDocs, addDoc, doc, deleteDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

import { loadOpenShifts } from "./calendar.js";

// Get logged-in user information
const currentUserID = sessionStorage.getItem("userID");
const currentUserName = sessionStorage.getItem("Name");
const currentTitle = sessionStorage.getItem("Title");

// Get the shift container
const container = document.getElementById("shiftList");

// Add event listener for Pickup buttons
container.addEventListener("click", async function(event) {

 const button = event.target.closest(".PickUpButton");
    if (!button) return;

        const date = button.dataset.date;
        const startTime = button.dataset.start;
        const endTime = button.dataset.end;
        const shiftId = button.dataset.shiftId;

         const snapshot = await getDocs(collection(db, "ShiftRequests"));

         for (const requestDoc of snapshot.docs) {
            const request = requestDoc.data();
                if(request.shiftID == shiftId){
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
                shiftID: shiftId
            });

            await deleteDoc(doc(db, "OpenShifts", shiftId));

            button.closest(".shiftInfo").remove();

            alert("Pickup request submitted!");

            button.disabled = true;
            button.textContent = "Requested";

        } catch (error) {

            console.error("Error submitting pickup request:", error);
            alert("Unable to submit pickup request.");

        }
});

// Load open shifts
loadOpenShifts();