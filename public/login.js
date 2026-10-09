//login JS



import {db} from "./firebase.js";
import {collection, getDocs, getDoc} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
// import {getAuth} from "./firebase.js/auth";

//add log out functionality and add 
// sessionStorage.clear();
// window.location.href = "login.html";

//login func
const userInfodb = await getDocs(collection(db, "userInfo"));
const contactdb = await getDocs(collection(db, "EmployeeContact"))
const loginForm = document.getElementById("login");

loginForm.addEventListener("submit", async (event) => {

     event.preventDefault();

     console.log("Login button was clicked!");

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    let loggedIn = false;

    for(const doc2 of contactdb.docs){
        const email = doc2.data();

        if(email.Email === username){
            const userDoc = await getDoc(email.id);

            if(userDoc.exists()){
                const user = userDoc.data();

                if(user.Password === password){
                    loggedIn = true;
                    error.style.display = "none";
                    sessionStorage.setItem("userID", email.id.id);
                    sessionStorage.setItem("Name", user.Name);
                    window.location.href = "index.html";
                    return;
                }
            }
        }
    }
    if (!loggedIn) {
        error.textContent = "Incorrect username or password.";
        error.style.display = "block";
    }

});