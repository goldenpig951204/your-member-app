const mongoose = require("mongoose");

const CredentialSchema = mongoose.Schema({
    type: {
        type: String
    },
    username: {
        type: String,
        required: true
    },
    password: {
        type: String,
        required: true
    }
});

const Credential = mongoose.model("credential", CredentialSchema);

module.exports = Credential;