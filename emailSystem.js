/**
 * Send an email message.
 * For this assignment, emails are simulated using console output.
 *
 * @param {string} to
 * @param {string} subject
 * @param {string} message
 */
function sendEmail(to, subject, message) {
    console.log("----- EMAIL START -----")
    console.log("To:", to)
    console.log("Subject:", subject)
    console.log("Message:", message)
    console.log("----- EMAIL END -----")
}

module.exports = {
    sendEmail
}