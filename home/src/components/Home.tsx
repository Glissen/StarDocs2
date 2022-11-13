import { useState, useEffect } from "react"
import axios from "axios"

export default function Home() {
    const [documents, setDocuments] = useState([])
    const [newDocName, setNewDocName] = useState("");

    axios.defaults.withCredentials = true;
    const api = axios.create({
        baseURL: 'http://duolcpu.cse356.compas.cs.stonybrook.edu/',
    })
    useEffect(() => {
        // const getDocuments = async() => {
        //     const response = await api.get('/collection/list');
        //     if (response.status === 200 && response.data) {
        //         console.log(response.data);
        //         setDocuments(response.data);
        //     }
        //     else {
        //         console.error("/collection/list error")
        //     }
        // }
        // getDocuments();
        let temp = [
            {
                id: "13543",
                name: "easu",
            },
            {
                id: "154315",
                name: "soanhusn"
            },
        ]
        setDocuments(temp);
    }, [])

    const collectionCreate = async() => {
        const response = await api.post('/collection/create', {
            name: newDocName
        });

        if (response.status === 200) {
            document.getElementById("label").innerHTML = "Document Created";
        }
        else {
            console.error("/collection/create error");
        }
    }

    const logout = async() => {
        const response = await api.post('logout');
        if (response.status === 200) {
            console.log("/logout success");
        }
        else {
            console.error("/logout error");
        }
    }

  return (
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
                return <a href={link}>{link}</a>
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
  )
}
