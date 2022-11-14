import { useState } from 'react'
import axios from 'axios'

export default function Login(props: {setLoggedIn: Function}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const login = async() => {
        const api = axios.create({
            baseURL: 'http://duolcpu.cse356.compas.cs.stonybrook.edu/',
        })
        const response = await api.post('/users/login', {
            email: email,
            password: password
        })

        if (response.status === 200) {
            window.location.reload();
        }
        else {
            console.error("/users/login error")
        }
    }
    return (
        <div id="login">
            <form onSubmit={(e) => {e.preventDefault(); login()}}>
                <div>Username</div>
                <input id='email' name='email' type='text' value={email} onChange={(e) => setEmail(e.target.value)}/>
                <div>Password</div>
                <input id='password' name='password' type='text' value={password} onChange={(e) => setPassword(e.target.value)}/>
                <button id='login-btn' type='submit'>Login</button>
            </form>
        </div>
    )
}
