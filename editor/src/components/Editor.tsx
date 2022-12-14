import { useEffect} from "react";
import ReactQuill from 'react-quill';
import { QuillBinding } from "y-quill";
import axios from "axios";
import 'react-quill/dist/quill.snow.css';

export default function Editor(props: {id: any, doc: any}) {
    let editor : any = null;
    let ref : any = null;
    useEffect(() => {
        editor = ref.getEditor();
        const content = props.doc.getText();
        new QuillBinding(content, editor);
        props.doc.on('update', async(update: any) => {
            await axios.post(`http://duolcpu.cse356.compas.cs.stonybrook.edu/api/op/${props.id}`, {
                update: update.toString()
            })
        })
    }, [])

    return (
        <ReactQuill 
            id="editor"
            theme="snow" 
            ref={(e) => { ref = e }}
        />
    )
}
