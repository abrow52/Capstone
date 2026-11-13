// //login JS

// Login JS
import { db } from "./firebase.js";

import {
    collection,
    getDocs,
    getDoc,
    doc
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const loginForm = document.getElementById("login");
const error = document.getElementById("error");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;

    try {
        const contactSnapshot = await getDocs(collection(db, "EmployeeContact"));

        let loggedIn = false;

        for (const contactDoc of contactSnapshot.docs) {
            const contact = contactDoc.data();

            if (contact.Email !== username) {
                continue;
            }

            // Get the linked userInfo document ID
            let userDocID;

            if (typeof contact.id === "string") {
                userDocID = contact.id;
            } else if (contact.id && contact.id.id) {
                userDocID = contact.id.id;
            } else {
                console.error("Invalid employee link:", contact.id);
                continue;
            }

            // Retrieve the employee's userInfo document
            const userDoc = await getDoc(doc(db, "userInfo", userDocID));

            if (!userDoc.exists()) {
                console.error("User document not found:", userDocID);
                continue;
            }

            const user = userDoc.data();

            // Check password
            if (user.Password === password) {
                loggedIn = true;

                error.style.display = "none";

                sessionStorage.setItem("userID", userDocID);
                sessionStorage.setItem("Name", user.Name);
                sessionStorage.setItem("Title", user.Title);

                window.location.href = "AssociateIndex.html";
                return;
            }
        }

        if (!loggedIn) {
            error.textContent = "Incorrect username or password.";
            error.style.display = "block";
        }

    } catch (err) {
        console.error("Login error:", err);
        error.textContent = "Something went wrong while logging in.";
        error.style.display = "block";
    }
});

// import {db} from "./firebase.js";
// import {collection, getDocs, getDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// // import {getAuth} from "./firebase.js/auth";

// //add log out functionality and add 
// // sessionStorage.clear();
// // window.location.href = "login.html";

// //login func
// const userInfodb = await getDocs(collection(db, "userInfo"));
// const contactdb = await getDocs(collection(db, "EmployeeContact"))
// const loginForm = document.getElementById("login");

// loginForm.addEventListener("submit", async (event) => {

//      event.preventDefault();

//      console.log("Login button was clicked!");

//     const username = document.getElementById("username").value;
//     const password = document.getElementById("password").value;

//     let loggedIn = false;

//     for(const doc2 of contactdb.docs){
//         const email = doc2.data();

//         if(email.Email === username){
//             const userDoc = await getDoc(email.id);

//             if(userDoc.exists()){
//                 const user = userDoc.data();

//                 if(user.Password === password){
//                     loggedIn = true;
//                     error.style.display = "none";
//                     sessionStorage.setItem("userID", email.id.id);
//                     sessionStorage.setItem("Name", user.Name);
//                     sessionStorage.setItem("Title", user.Title);
                   
//                       console.log("User:", user);
//                         console.log("Title:", user.Title);
//                         console.log("Link:", document.getElementById("managerLink"));

//                     window.location.href = "AssociateIndex.html";

//                 }
//             }
//         }
//     }
//     if (!loggedIn) {
//         error.textContent = "Incorrect username or password.";
//         error.style.display = "block";
//     }

// });