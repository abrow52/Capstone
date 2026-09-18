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