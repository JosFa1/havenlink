import session from "express-session";
import { deleteItem, getItem, putItem, updateItem } from "./dynamo";

type SessionItem = { PK: string; SK: string; session: string; expiresAt: number };
const sessionKey = (sid: string) => ({ PK: `SESSION#${sid}`, SK: "SESSION" });

export class DynamoSessionStore extends session.Store {
  get(sid: string, callback: (err: any, session?: session.SessionData | null) => void): void {
    getItem<SessionItem>(sessionKey(sid)).then((item) => {
      if (!item || item.expiresAt <= Math.floor(Date.now() / 1000)) return callback(null, null);
      try { callback(null, JSON.parse(item.session)); } catch (error) { callback(error); }
    }).catch((error) => callback(error));
  }
  set(sid: string, sess: session.SessionData, callback: (err?: any) => void): void {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 86400000;
    putItem({ ...sessionKey(sid), session: JSON.stringify(sess), expiresAt: Math.floor(expires / 1000) }).then(() => callback()).catch((error) => callback(error));
  }
  destroy(sid: string, callback: (err?: any) => void): void { deleteItem(sessionKey(sid)).then(() => callback()).catch((error) => callback(error)); }
  touch(sid: string, sess: session.SessionData, callback: (err?: any) => void): void {
    const expires = sess.cookie?.expires ? new Date(sess.cookie.expires).getTime() : Date.now() + 7 * 86400000;
    updateItem(sessionKey(sid), "SET #session = :session, expiresAt = :expires", { ":session": JSON.stringify(sess), ":expires": Math.floor(expires / 1000) }, { "#session": "session" }).then(() => callback()).catch((error) => callback(error));
  }
}
