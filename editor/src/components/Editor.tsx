import { useEffect} from "react";
import ReactQuill from 'react-quill';
import { QuillBinding } from "y-quill";
import { fromUint8Array } from "js-base64";
import axios from "axios";
import 'react-quill/dist/quill.snow.css';

export default function Editor(props: {id: any, doc: any}) {
    let editor : any = null;
    let ref : any = null;
    useEffect(() => {
        editor = ref.getEditor();
        const content = props.doc.getText('quill');
        new QuillBinding(content, editor);
        props.doc.on('update', async(update: any) => {
            await axios.post(`/api/op/${props.id}`, {
                update: fromUint8Array(update)
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
