import {Firestore} from "@google-cloud/firestore";
import {firestore} from "firebase-admin";
import FieldValue = firestore.FieldValue;
import Timestamp = firestore.Timestamp;

/** Storage Manager with Singleton Pattern */
export class Storage {
    private static instance: Storage;
    private static firestore: Firestore;

    public constructor() {
        Storage.instance = this;
    }

    public static connect(): boolean {
        const {Firestore} = require('@google-cloud/firestore');
        Storage.firestore = new Firestore({
            projectId: 'juice-streaming',
        });
        return true;
    }

    public static async getNetworks(){
        const networksRef = Storage.firestore.collection('networks');
        const snapshot = await networksRef.get();
        return snapshot.docs.map(doc => doc.data());
    }

    public static async updateWalletAccessCount(address, asset) {
        const logsCollectionRef = Storage.firestore.collection('logs');

        // Prepare the data
        const logData = {
            address: address,
            asset: asset,
            timestamp: Timestamp.now() // Current time as a Firestore Timestamp
        };

        // Add a new document with a generated ID
        const docRef = await logsCollectionRef.add(logData);

        console.log(`New log added with ID: ${docRef.id}`);
    }

    public static async updateWalletAccessCount2(address, asset) {
        const collectionRef = Storage.firestore.collection("views");
        const querySnapshot =
            await collectionRef
                .where("address", '==', address)
                .where("asset", '==', asset)
                .limit(1).get();

        if (querySnapshot.empty) {
            // If the document does not exist, create it with the counter initialized to incrementAmount.
            const newDocRef = await collectionRef.add({
                ["address"]: address,
                ["asset"]: asset,
                ["views"]: 1
            });
            console.log(`New document created with ID: ${newDocRef.id}`);
        } else {
            // If the document exists, increment the counter field.
            querySnapshot.forEach(doc => {
                const docRef = collectionRef.doc(doc.id);
                docRef.set({
                    ["views"]: FieldValue.increment(1)
                }, { merge: true });
                console.log(`Counter incremented in document with ID: ${doc.id}`);
            });
        }
    }

    public static async updateMediaAccessCount(address) {
        const collectionRef = Storage.firestore.collection("media");
        const querySnapshot =
            await collectionRef.where("address", '==', address).limit(1).get();

        if (querySnapshot.empty) {
            // If the document does not exist, create it with the counter initialized to incrementAmount.
            const newDocRef = await collectionRef.add({
                ["address"]: address,
                ["views"]: 1
            });
            console.log(`New document created with ID: ${newDocRef.id}`);
        } else {
            // If the document exists, increment the counter field.
            querySnapshot.forEach(doc => {
                const docRef = collectionRef.doc(doc.id);
                docRef.set({
                    ["views"]: FieldValue.increment(1)
                }, { merge: true });
                console.log(`Counter incremented in document with ID: ${doc.id}`);
            });
        }
    }

}
