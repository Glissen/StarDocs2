import './App.css';
import { useEffect, useState } from 'react';
import Editor from './components/Editor';
import * as Y from 'yjs'
import { toUint8Array } from 'js-base64';

function App() {
  const [connecting, setConnecting] = useState(true);
  const [sessionID, setSessionID] = useState('');
  const [doc, setDoc] = useState(new Y.Doc())

  useEffect(() => {
    const url = new URL(window.location.href);
    const arr = url.pathname.toString().split("/");

    console.log(arr[2]);
    async function connect(id: any) {
      const eventSource = new EventSource(`http://duolcpu.cse356.compas.cs.stonybrook.edu/api/connect/${id}`, { withCredentials: true });
      eventSource.onopen = (e) => {
        setSessionID(id);
        setConnecting(false);
      }
      eventSource.addEventListener('sync', (e) => {
        const content = toUint8Array(e.data);
        console.log(content);
        Y.applyUpdate(doc, content);
      })
      eventSource.addEventListener('update', (e) => {
        const content = toUint8Array(e.data);
        Y.applyUpdate(doc, content);
      })
      // eventSource.addEventListener('presence', (e) => {
      //   const content = JSON.parse(Base64.decode(e.data));
      //   console.log(content);
      //   let temp = presences.slice();
      //   if (content.session_id === sessionID) {
      //     let i = 0; 
      //     while (i < temp.length) {
      //       if (temp[i].name === content.name) {
      //         if (content.cursor === {}) {
      //           temp.splice(i, 1);
      //         }
      //         else {
      //           temp[i].cursor = content.cursor;
      //         }
      //         break;
      //       }
      //     }
      //     setPresences(temp);
      //   }
      // })
    }
    connect(arr[2]);
  }, [])

  return (  
    <div className="App">
      {/* {sessionID ? <Editor id={sessionID} doc={doc}/> : <Connect connect={connect} connecting={connecting}/>}  */}
      {connecting ? <div>Connecting...</div> : <Editor id={sessionID} doc={doc}/>}
    </div>
  );
}

export default App;
