 import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
  import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-analytics.js";
  import { getFirestore, collection, getDocs } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

  const firebaseConfig = {
    apiKey: "AIzaSyDf2OfUJFJPbHyJJgLRpYMCvspvoXhEirs",
    authDomain: "capstone-project-15eaf.firebaseapp.com",
    databaseURL: "https://capstone-project-15eaf-default-rtdb.firebaseio.com",
    projectId: "capstone-project-15eaf",
    storageBucket: "capstone-project-15eaf.firebasestorage.app",
    messagingSenderId: "609118337266",
    appId: "1:609118337266:web:bd64b747e398de725f386b",
    measurementId: "G-R6KLBY2H6M"
  };

  // Initialize Firebase
  const app = initializeApp(firebaseConfig);
  const analytics = getAnalytics(app);
  const db = getFirestore(app);

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