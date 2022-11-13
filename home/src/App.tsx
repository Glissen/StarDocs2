import './App.css';
import { useState } from 'react';
import Editor from './components/Editor';
import Connect from './components/Connect'; 
import * as Y from 'yjs'
import { toUint8Array } from 'js-base64';
import Home from './components/Home';

function App() {
  const [connecting, setConnecting] = useState(false);
  const [sessionID, setSessionID] = useState('');
  const [doc, setDoc] = useState(new Y.Doc())

  // async function connect(id: any) {
  //   setConnecting(true);
  //   const eventSource = new EventSource(`/api/connect/${id}`, { withCredentials: true });
  //   eventSource.onopen = (e) => {
  //     setSessionID(id);
  //     setConnecting(false);
  //   }
  //   eventSource.addEventListener('sync', (e) => {
  //     const content = toUint8Array(e.data);
  //     Y.applyUpdate(doc, content);
  //   })
  //   eventSource.addEventListener('update', (e) => {
  //     const content = toUint8Array(e.data);
  //     console.log(content)
  //     Y.applyUpdate(doc, content);
  //   })
  // }

  

  return (  
    <div className="App">
      {/* {sessionID ? <Editor id={sessionID} doc={doc}/> : <Connect connect={connect} connecting={connecting}/>}  */}
      <Home />
    </div>
  );
}

export default App;
