//this is where we are going to put all the code to grab from the database
import {db} from "./firebase.js";
import {collection, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";




//testFunc
const snapshot = await getDocs(collection(db, "userInfo"));
const userDiv = document.getElementById("test");

snapshot.forEach((doc) => {

    const user = doc.data();

    userDiv.innerHTML += `
        <div>
            <h2>${user.Name}</h2>
            <p>Title: ${user.Title}</p>
            <p>User ID: ${user.UserID}</p>
        </div>
    `;

});

const loginForm = document.getElementById("login");
// const error = document.getElementById("error");


loginForm.addEventListener("submit", async (event) => {

     event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    let loggedIn = false;

    snapshot.forEach((doc) => {

        const user = doc.data();

        if (user.Username == username && user.Password == password) {

            loggedIn = true;

            console.log("Login successful!");
            console.log("Welcome", user.Name);

            window.location.href = "index.html";
        }

    });

    // if (!loggedIn) {
    //     error.textContent = "Incorrect username or password.";
    // }

});