const express = require("express");
const plaid = require("plaid");
//app.use(express.json());
const router = express.Router();
const passport = require("passport");
const moment = require("moment");
const http = require("http");
const { Configuration, PlaidApi, PlaidEnvironments } = require("plaid");
// import fetch from "node-fetch";
// Load Account and User models
const Account = require("../../models/Account");
const User = require("../../models/User");
const Company = require("../../models/Company");
const configuration = new Configuration({
  basePath: PlaidEnvironments["sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": "6166d89a162e690010d7084b",
      "PLAID-SECRET": "9097d5e53b34172035a9cbf66e1047",
    },
  },
});

const client = new PlaidApi(configuration);
var uniq;
router.post("/getid", (req, res) => {
  try {
    console.log("this is getid", req.body);
    uniq = req.body.id;
  } catch (err) {
    console.log("this is the getid error", err.data);
  }
});
router.post("/create_link_token", async function (request, response) {
  // Get the client_user_id by searching for the current user
  // const user = await User.find(...); mongodb field _id unique
  //const clientUserId = user.id; logged in user k liye key  db email pwd + id
  console.log("token decoded from createlinktoken", request.body);

  const request1 = {
    user: {
      // This should correspond to a unique id for the current user.
      client_user_id: request.body.id,
    },
    client_name: "ClaimYourAid",
    products: ["auth", "transactions"],
    language: "en",
    country_codes: ["us"],
  };
  try {
    const createTokenResponse = await client.linkTokenCreate(request1);
    await response.json(createTokenResponse.data);
  } catch (error) {
    // handle error
    console.log("This is a plaid link button error", error);
  }
});

var PUBLIC_TOKEN = null;
var ACCESS_TOKEN = null;
var ITEM_ID = null;

// @route GET api/plaid/accounts
// @desc Get all accounts linked with plaid for a specific user
// @access Private
router.get(
  "/accounts",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Account.find({ userId: req.user.id })
      .then((accounts) => res.json(accounts))
      .catch((err) => console.log(err));
  }
);

// @route POST api/plaid/accounts/add
// @desc Trades public token for access token and stores credentials in database
// @access Private
router.post(
  "/accounts/add",
  passport.authenticate("jwt", { session: false }),
  async (req, res) => {
    PUBLIC_TOKEN = req.body.public_token;
    console.log(req.body);
    const userId = req.user.id;
    const institution = req.body.metadata.institution;
    const { name, institution_id } = institution;

    const publicToken = req.body.public_token;
    try {
      const request = {
        public_token: publicToken,
      };
      const response = await client.itemPublicTokenExchange(request);
      ACCESS_TOKEN = await response.data.access_token;
      ITEM_ID = await response.data.item_id;
      await console.log(response.data);
      const mungu = async () => {
        if (PUBLIC_TOKEN) {
          Account.findOne({
            userId: req.user.id,
            institutionId: institution_id,
          })
            .then((account) => {
              if (account) {
                console.log("Account already exists");
              } else {
                const newAccount = new Account({
                  userId: userId,
                  accessToken: ACCESS_TOKEN,
                  itemId: ITEM_ID,
                  institutionId: institution_id,
                  institutionName: name,
                });

                newAccount.save().then((account) => res.json(account));
              }
            })
            .catch((err) => {
              console.log("wow", err);
            }); // Mongo Error
        }
      };
      await mungu();
    } catch (error) {
      // handle error
      console.log("acces token exchange erro");
    }
  }
);

// @route DELETE api/plaid/accounts/:id
// @desc Delete account with given id
// @access Private
router.delete(
  "/accounts/:id",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    Account.findById(req.params.id).then((account) => {
      // Delete account
      account.remove().then(() => res.json({ success: true }));
    });
  }
);

// @route POST api/plaid/accounts/transactions
// @desc Fetch transactions from past 30 days from all linked accounts
// @access Private
router.post(
  "/accounts/transactions",
  passport.authenticate("jwt", { session: false }),
  (req, res) => {
    const now = moment();
    const today = now.format("YYYY-MM-DD");
    const thirtyDaysAgo = now.subtract(30, "days").format("YYYY-MM-DD");

    let transactions = [];

    const accounts = req.body;
    //console.log(accounts);
    if (accounts) {
      accounts.forEach(function (account) {
        ACCESS_TOKEN = account.accessToken;
        const institutionName = account.institutionName;
        const txnreq = {
          access_token: ACCESS_TOKEN,
          start_date: thirtyDaysAgo,
          end_date: today,
        };
        client
          .transactionsGet(txnreq)
          .then((response) => {
            //console.log(response);
            transactions.push({
              accountName: institutionName,
              transactions: response.data.transactions,
            });

            if (transactions.length === accounts.length) {
              res.json(transactions);
            }
          })
          .catch((err) => console.log(err));
      });
    }
  }
);

router.post("/CreateCompany", (req, res) => {
  const newcompany = new Company({
    name: req.body.name,
    ein: req.body.ein,
    states: req.body.states,
  });

  newcompany.save().then((company) => res.json(company));
});
module.exports = router;
