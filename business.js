const persistence = require('./persistence.js')
const crypto = require('crypto')
const emailSystem = require('./emailSystem')

/**
 * Temporary in-memory storage for pending 2FA codes.
 * Key = username
 * Value = { code: number, expires: number }
 */
let pending2FA = {}

/**
 * Return a list of all employees loaded from the storage.
 * @returns {Array<{ employeeId: string, name: string, phone: string }>}
 */
async function getAllEmployees() {
    return await persistence.getAllEmployees()
}

/**
 * Get a single employee by ID.
 * @param {string} id
 * @returns {Object|null}
 */
async function getEmployee(id) {
    return await persistence.findEmployee(id)
}

/**
 * Attempt login with 2FA and security checks.
 *
 * On invalid password:
 * - increment failed attempts
 * - send warning email after 3 failed attempts
 * - lock account after 10 failed attempts
 *
 * On valid password:
 * - reset failed attempts
 * - generate a 6-digit 2FA code
 * - store the code for 3 minutes
 * - send the code by email
 *
 * The real session is created only after 2FA verification.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Object|null}
 */
async function startSession(username, password) {
    const user = await persistence.findUser(username)

    if (!user) {
        return null
    }

    if (user.disabled) {
        return null
    }

    let valid = await persistence.checkCredentials(username, password)

    if (!valid) {
        let attempts = await persistence.incrementFailedLogin(username)

        if (attempts === 3) {
            emailSystem.sendEmail(
                user.email,
                "Security Alert",
                "There have been multiple failed login attempts on your account."
            )
        }

        if (attempts >= 10) {
            await persistence.lockUserAccount(username)
        }

        return null
    }

    await persistence.resetFailedLogin(username)

    const code = Math.floor(100000 + Math.random() * 900000)
    const expires = Date.now() + 3 * 60 * 1000

    pending2FA[username] = {
        code: code,
        expires: expires
    }

    emailSystem.sendEmail(
        user.email,
        "Your 2FA Code",
        "Your verification code is: " + code
    )

    return {
        twoFA: true,
        user: username
    }
}

/**
 * Verify a submitted 2FA code.
 * If valid and not expired, create the session.
 *
 * @param {string} username
 * @param {string|number} inputCode
 * @returns {{sessionId: string, duration: number}|null}
 */
async function verify2FACode(username, inputCode) {
    let record = pending2FA[username]

    if (!record) {
        return null
    }

    if (Date.now() > record.expires) {
        delete pending2FA[username]
        return null
    }

    if (String(record.code) !== String(inputCode)) {
        return null
    }

    const sessionId = crypto.randomUUID()
    const duration = 5 * 60

    await persistence.createSession(sessionId, duration, {
        user: username
    })

    delete pending2FA[username]

    return {
        sessionId: sessionId,
        duration: duration
    }
}

/**
 * Determine if a session is valid.
 * @param {string} sessionId
 * @returns {boolean}
 */
async function validSession(sessionId) {
    let result = await persistence.getSessionData(sessionId)
    return result != null
}

/**
 * Extend an existing session.
 * @param {string} sessionId
 * @returns {number}
 */
async function extendSession(sessionId) {
    let extension = 5 * 60
    await persistence.extendSession(sessionId, extension)
    return extension
}

/**
 * Log a security event.
 * @param {string} sessionId
 * @param {string} url
 * @param {string} method
 */
async function logEvent(sessionId, url, method) {
    let sessionData = await persistence.getSessionData(sessionId)
    let username = ""

    if (sessionData) {
        username = sessionData.user
    }

    await persistence.logEvent(username, url, method)
}

/**
 * Get shifts assigned to an employee.
 * @param {string} empId
 * @returns {Array}
 */
async function getEmployeeShifts(empId) {
    return await persistence.getEmployeeShifts(empId)
}

/**
 * Add a new employee record.
 * @param {{name: string, phone: string}} emp
 */
async function addEmployeeRecord(emp) {
    return await persistence.addEmployeeRecord(emp)
}

/**
 * Assign a shift to an employee.
 * @param {string} empId
 * @param {string} shiftId
 * @returns {string}
 */
async function assignShift(empId, shiftId) {
    let employee = await persistence.findEmployee(empId)
    if (!employee) {
        return "Employee does not exist"
    }

    let shift = await persistence.findShift(shiftId)
    if (!shift) {
        return "Shift does not exist"
    }

    let assignment = await persistence.findAssignment(empId, shiftId)
    if (assignment) {
        return "Employee already assigned to shift"
    }

    let maxHours = await persistence.getDailyMaxHours()
    let currentShifts = await persistence.getEmployeeShiftsOnDate(empId, shift.date)
    let newShiftLength = computeShiftDuration(shift.startTime, shift.endTime)

    let scheduledHours = 0
    for (let s of currentShifts) {
        scheduledHours += computeShiftDuration(s.startTime, s.endTime)
    }

    let newAllocation = newShiftLength + scheduledHours

    if (newAllocation > maxHours) {
        return "Hour Violation"
    }

    await persistence.addAssignment(empId, shiftId)

    return "Ok"
}

/**
 * Compute shift duration in hours.
 * @param {string} startTime
 * @param {string} endTime
 * @returns {number}
 */
function computeShiftDuration(startTime, endTime) {
    const [startHour, startMinute] = startTime.split(":").map(Number)
    const [endHour, endMinute] = endTime.split(":").map(Number)

    const startTotalMinutes = startHour * 60 + startMinute
    const endTotalMinutes = endHour * 60 + endMinute

    return (endTotalMinutes - startTotalMinutes) / 60
}

/**
 * Disconnect from database.
 */
async function disconnectDatabase() {
    await persistence.disconnectDatabase()
}

/**
 * Update employee information.
 * @param {Object} emp
 */
async function updateEmployee(emp) {
    return await persistence.updateEmployee(emp)
}

module.exports = {
    getAllEmployees,
    assignShift,
    addEmployeeRecord,
    getEmployeeShifts,
    disconnectDatabase,
    getEmployee,
    updateEmployee,
    startSession,
    verify2FACode,
    validSession,
    extendSession,
    logEvent
}
