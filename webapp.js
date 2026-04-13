const express = require('express')
const handlebars = require('express-handlebars')
const cookieParser = require('cookie-parser')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const business = require('./business.js')

const app = express()

app.set('view engine', 'hbs')
app.set('views', __dirname + "/template")
app.engine('hbs', handlebars.engine())

app.use('/public', express.static(__dirname + "/static"))
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())

/* ===================== MULTER CONFIG ===================== */

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const employeeFolder = path.join(__dirname, 'uploads', req.params.eid)

        if (!fs.existsSync(employeeFolder)) {
            fs.mkdirSync(employeeFolder, { recursive: true })
        }

        cb(null, employeeFolder)
    },
    filename: function (req, file, cb) {
        const uniqueName = Date.now() + "-" + file.originalname
        cb(null, uniqueName)
    }
})

function fileFilter(req, file, cb) {
    if (file.mimetype === 'application/pdf') {
        cb(null, true)
    } else {
        cb(new Error('Only PDF files allowed'), false)
    }
}

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 2 * 1024 * 1024 }
})

/* ===================== LOGGING ===================== */

app.use(async (req, res, next) => {
    let sessionId = req.cookies.session
    await business.logEvent(sessionId, req.url, req.method)
    next()
})

/* ===================== LOGIN ===================== */

app.get('/login', (req, res) => {
    let message = req.query.msg || ""

    res.render('login', {
        message,
        layout: undefined
    })
})

app.post('/login', async (req, res) => {
    let username = req.body.username
    let password = req.body.password

    let result = await business.startSession(username, password)

    if (!result) {
        res.redirect('/login?msg=Invalid username/password')
        return
    }

    if (result.twoFA) {
        res.redirect('/two_factor?user=' + encodeURIComponent(result.user))
        return
    }

    if (result.sessionId && result.duration) {
        res.cookie('session', result.sessionId, {
            maxAge: result.duration * 1000,
            httpOnly: true
        })
        res.redirect('/')
        return
    }

    res.redirect('/login?msg=Unexpected error')
})

/* ===================== 2FA ===================== */

app.get('/two_factor', (req, res) => {
    let user = req.query.user || ""
    let message = req.query.msg || ""

    res.render('two_factor', {
        user,
        message,
        layout: undefined
    })
})

app.post('/two_factor', async (req, res) => {
    let username = req.body.username
    let code = req.body.code

    let result = await business.verify2FACode(username, code)

    if (!result) {
        res.redirect('/two_factor?user=' + encodeURIComponent(username) + '&msg=Invalid or expired code')
        return
    }

    res.cookie('session', result.sessionId, {
        maxAge: result.duration * 1000,
        httpOnly: true
    })

    res.redirect('/')
})

/* ===================== LOGOUT ===================== */

app.get('/logout', (req, res) => {
    res.clearCookie('session')
    res.redirect('/login?msg=Logged out')
})

/* ===================== AUTH MIDDLEWARE ===================== */

app.use(async (req, res, next) => {
    let sessionId = req.cookies.session

    if (!sessionId) {
        res.redirect('/login?msg=You must be logged in')
        return
    }

    let valid = await business.validSession(sessionId)

    if (!valid) {
        res.clearCookie('session')
        res.redirect('/login?msg=Session not valid')
        return
    }

    let extension = await business.extendSession(sessionId)

    res.cookie('session', sessionId, {
        maxAge: extension * 1000,
        httpOnly: true
    })

    next()
})

/* ===================== MAIN PAGES ===================== */

app.get('/', async (req, res) => {
    let empList = await business.getAllEmployees()

    res.render('landing', {
        empList,
        layout: undefined
    })
})

app.get('/employee/:eid', async (req, res) => {
    let employeeDetails = await business.getEmployee(req.params.eid)
    let shifts = await business.getEmployeeShifts(req.params.eid)

    for (let s of shifts) {
        s.startEarly = s.startTime < '12:00'
        s.endEarly = s.endTime < '12:00'
    }

    const folder = path.join(__dirname, 'uploads', req.params.eid)

    let files = []
    if (fs.existsSync(folder)) {
        files = fs.readdirSync(folder)
    }

    res.render('single_employee', {
        employeeDetails,
        shifts,
        files,
        layout: undefined
    })
})

app.get('/edit/:eid', async (req, res) => {
    let employeeDetails = await business.getEmployee(req.params.eid)

    res.render('edit_employee', {
        employeeDetails,
        layout: undefined
    })
})

app.post('/update-employee', async (req, res) => {
    let employeeId = req.body.id.trim()
    let employeeName = req.body.name.trim()
    let employeePhone = req.body.phone.trim()

    if (employeeName === "" || employeePhone === "") {
        res.send("Form inputs invalid")
        return
    }

    let result = await business.updateEmployee({
        employeeId,
        employeeName,
        employeePhone
    })

    if (result === "OK") {
        res.redirect('/')
    } else {
        res.send("Error updating employee")
    }
})

/* ===================== UPLOAD ===================== */

app.post('/upload/:eid', (req, res) => {
    const folder = path.join(__dirname, 'uploads', req.params.eid)

    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true })
    }

    const files = fs.readdirSync(folder)

    if (files.length >= 5) {
        res.send("Maximum 5 documents are allowed for this employee")
        return
    }

    upload.single('document')(req, res, function (err) {
        if (err) {
            res.send(err.message)
            return
        }

        if (!req.file) {
            res.send("No file uploaded")
            return
        }

        console.log("Uploaded:", req.file.filename)

        res.redirect('/employee/' + req.params.eid)
    })
})

/* ===================== DOWNLOAD ===================== */

app.get('/download/:eid/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.eid, req.params.filename)

    if (!fs.existsSync(filePath)) {
        res.send("File not found")
        return
    }

    res.download(filePath)
})

/* ===================== SERVER ===================== */

app.listen(8000, () => {
    console.log("Server running on http://localhost:8000")
})
