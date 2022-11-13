import { useState, useEffect } from "react"
import axios from "axios"
import Login from "./Login";

export default function Home() {
    const [documents, setDocuments] = useState([])
    const [newDocName, setNewDocName] = useState("");
    const [loggedIn, setLoggedIn] = useState(false)

    axios.defaults.withCredentials = true;
    const api = axios.create({
        baseURL: 'http://duolcpu.cse356.compas.cs.stonybrook.edu/',
    })
    useEffect(() => {
        const getDocuments = async() => {
            const response = await api.get('/collection/list');
            if (response.status === 200 && !response.data.error) {
                console.log(response.data);
                setDocuments(response.data);
            }
            else {
                setLoggedIn(false);
            }
        }
        getDocuments();
        // let temp = [
        //     {
        //         id: "13543",
        //         name: "easu",
        //     },
        //     {
        //         id: "154315",
        //         name: "soanhusn"
        //     },
        // ]
        // setDocuments(temp);
    }, [])

    const collectionCreate = async() => {
        const response = await api.post('/collection/create', {
            name: newDocName
        });

        if (response.status === 200 && !response.data.error) {
            document.getElementById("label").innerHTML = "Document Created";
        }
        else {
            console.error("/collection/create error");
        }
    }

    const collectionDelete = async(index: any) => {
        const response = await api.post('/collection/delete', {
            id: documents[index].id,
        })

        if (response.status === 200 && !response.data.error) {
            console.log("/collection/delete success");
        }
        else {
            console.error("/collection/delete error");
        }
    }

    const logout = async() => {
        const response = await api.post('/users/logout');
        if (response.status === 200 && !response.data.error) {
            setLoggedIn(false);
        }
        else {
            console.error("/users/logout error");
        }
    }

    return (
        loggedIn ?
        <div id="home">
            <div id="edit-links">
                {documents.map((doc, index) => {
                    const link = `http://duolcpu.cse356.compas.cs.stonybrook.edu/edit/${doc.id}`
                    return <a href={link}>{link}</a>
                })}
            </div>
            <br></br>
            <div id="delete-links">
                {documents.map((doc, index) => {
                    const link = `http://duolcpu.cse356.compas.cs.stonybrook.edu/collection/delete/${doc.id}`
                    return <a href="javascript:void(0)" onClick={() => collectionDelete(index)}>{link}</a>
                })}
            </div>
            <br></br>
            <form onSubmit={(e) => {e.preventDefault(); collectionCreate()}}>
                <div>New Document Name: </div>
                <input id='document-name' name='document-name' type='text' value={newDocName} onChange={(e) => setNewDocName(e.target.value)}/>
                <button id='connect-btn' type='submit'>Create</button>
            </form>
            <div id="label"></div>
            <br></br>
            <br></br>
            <button id='logout-btn' type='button' onClick={() => logout()}>Logout</button>
        </div>
        :
        <Login setLoggedIn={setLoggedIn}/>
    )
}
