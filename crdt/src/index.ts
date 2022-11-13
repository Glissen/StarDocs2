import * as Y from 'yjs';
import 'quill-delta-to-html';
import { QuillDeltaToHtmlConverter } from 'quill-delta-to-html';

class CRDTFormat {
  public bold?: Boolean = false;
  public italic?: Boolean = false;
  public underline?: Boolean = false;
};

exports.CRDT = class {
  private ydoc;
  private cb;
  private ytext;

  constructor(cb: (update: string, isLocal: Boolean) => void) {
    this.ydoc = new Y.Doc();
    this.ytext = this.ydoc.getText();
    this.cb = cb;
    ['update', 'insert', 'delete', 'toHTML'].forEach(f => (this as any)[f] = (this as any)[f].bind(this));
  }

  update(update: string) {
    const diff = Uint8Array.from(update.split(',').map(x => parseInt(x, 10)));
    Y.applyUpdate(this.ydoc, diff)
    this.cb(update, false)
  }

  insert(index: number, content: string, format: CRDTFormat) {
    const stateVector = Y.encodeStateVector(this.ydoc);
    this.ytext.insert(index, content, format);
    const diff = Y.encodeStateAsUpdate(this.ydoc, stateVector)
    this.cb(JSON.stringify({ update: diff.toString() }), true)
  }

  insertImage(index: number, url: string) {
    const stateVector = Y.encodeStateVector(this.ydoc);
    this.ytext.applyDelta([
      {
        "retain": index
      },
      {
        insert: {
          image: url
        }
      }]);
    const diff = Y.encodeStateAsUpdate(this.ydoc, stateVector)
    this.cb(JSON.stringify({ update: diff.toString() }), true)
  }

  delete(index: number, length: number) {
    const stateVector = Y.encodeStateVector(this.ydoc);
    this.ytext.delete(index, length);
    const diff = Y.encodeStateAsUpdate(this.ydoc, stateVector)
    this.cb(JSON.stringify({ update: diff.toString() }), true)
  }

  toHTML() {
    const deltaOps = this.ytext.toDelta();
    const converter = new QuillDeltaToHtmlConverter(deltaOps);
    return converter.convert();
  }
};
