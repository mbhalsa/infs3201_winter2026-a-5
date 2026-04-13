const mongodb = require('mongodb')

let cachedClient = undefined

async function getDatabase() {
    if (cachedClient) {
        return cachedDb // already connected so use the cache
    }
    cachedClient = new mongodb.MongoClient('mongodb+srv://60106430:M59955155m%24@cluster0.czdr4xk.mongodb.net/infs3201_winter2026?retryWrites=true&w=majority&appName=Cluster0')
    await cachedClient.connect()
    cachedDb = cachedClient.db('infs3201_winter2026')
    return cachedDb
}

async function closeDatabase() {
    cachedClient.close()
}

async function getEmployeeObjectId(empId) {
    let db = await getDatabase()
    let employeeCollection = db.collection('employees')
    let employee = await employeeCollection.findOne({employeeId: empId})
    return employee._id
}

async function getShiftObjectId(shiftId) {
    let db = await getDatabase()
    let shiftCollection = db.collection('shifts')
    let shift = await shiftCollection.findOne({shiftId: shiftId})
    return shift._id
}

async function loadEmployeesInShifts() {
    let db = await getDatabase()
    let assignmentsCollection = db.collection('assignments')
    let assignments = await assignmentsCollection.find().toArray()
    let shifts = db.collection('shifts')
    for (let asn of assignments) {
        console.log(asn)
        let employeeId = await getEmployeeObjectId(asn.employeeId)
        let shiftId = await getShiftObjectId(asn.shiftId)
        console.log(employeeId, shiftId)
        await shifts.updateOne(
            { _id: new mongodb.ObjectId(shiftId) },
            { $push: { employees: new mongodb.ObjectId(employeeId) } }
        )

    }
    await closeDatabase()
}

async function createEmptyListsInShifts() {
    let db = await getDatabase();
    let shifts = db.collection('shifts')
    await shifts.updateMany({}, {$set: { employees: []}})
    await closeDatabase()
}

//createEmptyListsInShifts()
loadEmployeesInShifts()

/*
clean up

db.employees.updateMany({}, {$unset: {employeeId: ""}})
db.shifts.updateMany({}, {$unset: {shiftId: ""}})
db.assignments.drop()
*/