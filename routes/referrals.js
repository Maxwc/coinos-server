var express = require('express');
var router = express.Router();
var debug = require('debug')('debug')

const { v4: uuidv4 } = require('uuid');

router.get('/', function(req, res, next) {
  res.send('list of referrals...');
});

// Grant & Retrieve Referral tokens for existing user

// usage:  GET '/grant?sponsor_id=N&expiry=2021-09-01'
//
// Required: 
//   sponsor_id (= user.id)
// Changes to DB: 
//    adds record to referrals table:
//      { token: <uuid>, sponsor_id: <user.id>, status: "available" }

/**
 * @api {post} /grant Grant Referral code
 * @apiName Grant
 * @apiGroup Referrals
 *
 * 
 * @apiPermission member
 * 
 * @apiParam {sponsor_id} user_id of member generating referral code.
 * @apiParam {expiry} optional expiry date for token.
 *
 * @apiSuccess {String} token referral token
 * @apiSuccess {Date} expiry optional expiry
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *        "token": "*********", 
 *        "status": "available", 
 *        "expiry": null
 *     }
 */
router.post(
  "/grant",
  auth,
  ah(async (req, res) => {
    const {sponsor_id, expiry} = req.body
    debug('grant token..')
    var token = uuidv4()
    debug('generated token: ' + token + ' sponsored by ' + sponsor_id)

    var ref = await db.Referral.create({
      sponsor_id: sponsor_id, 
      token: token, 
      status: 'available'
    })

    debug('generated referral: ' + JSON.stringify(ref))
    return res.send({token: token, status: 'available', expiry: expiry})
  })
);

/**
 * @api {get} /grant Grant Referral code (variation using get)
 * @apiName Grant
 * @apiGroup Referrals
 *
 * @apiPermission member
 * 
 * @apiPermission member
 * @apiParam {sponsor_id} user_id of member generating referral code.
 * @apiParam {expiry} optional expiry date for token.
 *
 * @apiSuccess {String} token referral token
 * @apiSuccess {Status} status referral status
 * @apiSuccess {Date} expiry optional expiry
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *        "token": "*********", 
 *        "status": "available", 
 *        "expiry": null
 *     }
 */
router.get(
  "/grant",
  auth,
  ah(async (req, res) => {
    const {sponsor_id, expiry} = req.query
    debug('grant token..')
    var token = uuidv4()
    debug('generated token: ' + token + ' sponsored by ' + sponsor_id)

    var ref = await db.Referral.create({
      sponsor_id: sponsor_id, 
      token: token, 
      status: 'available'
    })

    debug('generated referral: ' + JSON.stringify(ref))
    return res.send({token: token, status: 'available', expiry: expiry})
  })
);


/**
 * @api {get} /checkTokens/:sponsor_id Retrieve list of referral tokens generated by this user
 * 
 * @apiName checkTokens
 * @apiGroup Referrals
 *
 *  
 * @apiPermission member
 * 
 * @apiParam {sponsor_id} user_id of member generating referral code.
 * @apiParam {status} optional token status.
 *
 * @apiSuccess tokens array of token objects 
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "tokens": [
 *         {"token": "*********", "status": "available", "expiry": null}
 *       ]
 *     }
 */

// TO FIX - change sponsor_id so that it is retrieved from current payload (NOT FROM URL)

router.get(
  "/checkTokens/:sponsor_id",
  auth,
  ah(async (req, res) => {
    const {sponsor_id} = req.params
    const {status} = req.query

    var tokens = knex
      .select(
        'token',
        'created_at',
        knex.raw('LEFT(created_at,10) as created'),
        'username',
        'status'
      )
      .from('referrals')
      .leftJoin('users', 'users.id', 'referrals.user_id')
      .where('sponsor_id', 'like', sponsor_id)

    if (status && status !== 'all') tokens = tokens.where('status', 'like', status)
    console.log(sponsor_id + ' : ' + status)
    const found = await tokens

    debug('my tokens: ' + JSON.stringify(found))

    return res.send({tokens: found})
  })
);


/**
 * @api {get} /verify/:user_id  Verify token and apply to existing user
 * 
 * @apiName verify
 * @apiGroup Referrals
 * 
 * @apiPermission member
 *  
 * @apiParam {user_id} Current user
 * @apiParam {token} Token to validate
 *
 * @apiSuccess verified = true
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "verified": true
 *     }
 * 
 * @apiDescription referral token is updated from 'available' to 'used'
 * @apiDescription referral token is updated with existing user_id
 */
router.get(
  "/verify/:user_id/:token",
  auth,
  ah(async (req, res) => {
    const { user_id, token } = req.params;

    debug('verify token: ' + token)
      
    const found = await db.Referral.findAll({
      attributes: ['status'],
      where: {
        token: token,
        user_id: null
      }
    })

    if (found && found.length) {
      debug('found referral: ' + JSON.stringify(found))
      if (found[0].status === 'available') {

        await db.Referral.update(
          { 
            status: 'used',
            user_id: user_id,
            updated_at: new Date().toISOString().substring(0,10)
          },
          {
            where: { token: token }
          }
        )

        return res.send({ verified: true, sponsor_id: found.sponsor_id, updated: found.updated_at});
      } else {
        res.status(500).send({ verified: false, message: 'Referral already ' + found[0].status })
      }
    } else {
      res.status(500).send('Invalid referral token')
    }
  })
);


/**
 * @api {post} /joinQueue  Join waiting list (track email & phone)
 * @apiName joinQueue
 * @apiGroup Referrals
 *
 * @apiParam {email} email address
 * @apiParam {phone} phone number
 *
 * @apiSuccess verified = true
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "success": true
 *       "message": 'Added to waiting list'
 *     }
 * 
 * @apiDescription referral token is updated from 'available' to 'used'
 * @apiDescription referral token is updated with existing user_id
 */
router.post(
  "/joinQueue",
  ah(async (req, res) => {
    const { email, phone } = req.body;

    debug('email: ' + email)
    debug('phone: ' + phone)
    console.log(email + ' BODY: ' + JSON.stringify(req.body))
    await db.WaitingList.create({
      email: email,
      phone: phone    
    })

    res.send({success: true, message: 'Added ' + email + ' to waiting list ' + phone})
  })
);

router.get(
  "/joinQueue",
  ah(async (req, res) => {
    const {email, phone} = req.query;

    debug('email: ' + email)
    debug('phone: ' + phone)
    console.log(email + ' BODY: ' + JSON.stringify(req.body))
    await db.WaitingList.create({
      email: email,
      phone: phone    
    })

    res.send({success: true, message: 'Added ' + email + ' to waiting list ' + phone})
  })
);

/**
 * @api {get} /isReferred/:user_id  Check if user is referred
 * @apiName isReferred
 * @apiGroup Referrals
 *
 * @apiParam {user_id} user id
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       true
 *     }
 * 
 * @apiDescription returns boolean indicating if user is referred or not
 */
 router.get(
  "/isReferred/:user_id",
  ah(async (req, res) => {
    const { user_id } = req.params;

    var referred = await db.Referral.findOne({
      where: {
        user_id: user_id,
        status: 'used'
      }
    })
    
    if (referred) {
      res.send(true)
    } else {
      res.send(false)
    }
  })
 );

module.exports = router;
