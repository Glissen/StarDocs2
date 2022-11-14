import './App.css';
import { useEffect, useState } from 'react';
import Editor from './components/Editor';
import * as Y from 'yjs'

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
        let temp: string = e.data;
        const content = Uint8Array.from(temp.split(',').map(x => parseInt(x, 10)));
        console.log(content);
        Y.applyUpdate(doc, content);
      })
      eventSource.addEventListener('update', (e) => {
        let temp: string = e.data;
        const content = Uint8Array.from(temp.split(',').map(x => parseInt(x, 10)));
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
