const firebaseConfig = {
    apiKey: "AIzaSyDoQnM4_-3xG008xSuClMZjIEbAMOEp0UM",
    authDomain: "chatbasico-55ccd.firebaseapp.com",
    databaseURL: "https://chatbasico-55ccd-default-rtdb.firebaseio.com",
    projectId: "chatbasico-55ccd",
    storageBucket: "chatbasico-55ccd.firebasestorage.app",
    messagingSenderId: "82321391752",
    appId: "1:82321391752:android:436f660570fe0edd845f3d",
    measurementId: "G-4WVRZC8W4H"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const database = firebase.database();