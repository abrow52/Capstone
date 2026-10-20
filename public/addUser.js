
import { db } from "./firebase.js";
import {
    collection, doc,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const addUserForm = document.getElementById("addUserForm");

addUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("newUserName").value.trim();
    const password = document.getElementById("newPassword").value;
    const title = document.getElementById("newTitle").value.trim();
    const email = document.getElementById("newEmail").value.trim();

    try {
        // Generate a new user document reference
        const userRef = doc(collection(db, "userInfo"));
    
        // Create the user
        await setDoc(userRef, {
            Name: name,
            Password: password,
            Title: title,
            UserID: userRef.id,
        });
    
        // Create contact information linked to that user
        await setDoc(doc(collection(db, "EmployeeContact")), {
            Email: email,
            id: userRef,
        });
    
        alert("User added successfully!");
        addUserForm.reset();
        addUserForm.style.display.none;
    
    } catch (error) {
        alert("Failed to add user: " + error.message);
    }
});
