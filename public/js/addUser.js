import { db } from "./firebase.js";
import {collection, doc, setDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const addUserForm = document.getElementById("addUserForm");

addUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("newUserName").value.trim();
    const password = document.getElementById("newUserPassword").value;
    const title = document.getElementById("newTitle").value.trim();
    const email = document.getElementById("newEmail").value.trim();

    console.log("Name:", name);
    console.log("Password:", password);
    console.log("Title:", title);
    console.log("Email:", email);
    try {
        //make new user doc
        const userRef = doc(collection(db, "userInfo"));
    
        //create the user
        await setDoc(userRef, {
            Name: name,
            Password: password,
            Title: title,
            UserID: userRef.id,
        });
    
        // create user contact info
        await setDoc(doc(collection(db, "EmployeeContact")), {
            Email: email,
            id: userRef,
        });
    
        alert("User added successfully!");
        addUserForm.reset();
        addUserForm.style.display = "none";
    
    } catch (error) {
        alert("Failed to add user: " + error.message);
    }
});
