const mongoose = require('mongoose');
const sharp = require('sharp');
const userEmail = require("../config/credentials")
const securityCalendarModel = require('../models/securityCalendarModel').securityCalendarModel;
const visitorModel = require('../models/securityCalendarModel').visitorModel;
const privateCalendarModel = require('../models/privateCalendarModel');
const allCalendarModel = require('../models/allCalendarModel');

const userModel = require("../models/userModel");
const userModelFunctions = require("../API/UserModelfunctions");
const timeManipulation = require('./helpers/timeManipulation');
async function addVisitorintoSecurityCalendar(req, userIdOfTheBusinessCalendar, uniqueIdForVisitorEntry, callback) {
    var calendar = await securityCalendarModel.findOne({
        userId: userIdOfTheBusinessCalendar,
        'dailyVisitors.date': req.params.dateForSecurityVehicleRecord
    }).select('dailyVisitors.$');
    let visitor = {
        _id: uniqueIdForVisitorEntry
    };
    for (element in req.body) {
        visitor[element] = req.body[element];
    }

    // FOR REDUCING SIZE OF IMAGE AND MAKING IT PREVIEW IMAGE
    let imageNameForSharp = (((req.body.photoUrl).replace(".jpg", "")).replace(".png", "")).replace(".jpeg", "")
    console.log('imageNameForSharp')
    console.log(imageNameForSharp)
    sharp(`${req.body.photoUrl}`).resize(640, 480)
        .jpeg({ quality: 80 }).toFile(`${imageNameForSharp}_preview.jpg`);
    visitor.photoUrl = `${imageNameForSharp}_preview.jpg`

    visitor.entryApproved = "pending"
    visitor.allCalendarIdOfTheSecurityCalendar = req.params.idOfCalendarForSecurityVehicleRecord;
    if (req.body.idOfHost == null || req.body.idOfHost == undefined) {
        await userModel.findOne({ number: req.body.contactNumberOfHost }, (err, hostUser) => {
            console.log("hostUser")
            console.log(hostUser)
            visitor.idOfHost = hostUser.id
            console.log("Id of host" + visitor.idOfHost)
        })
    }
    if (req.body.idOfVisitor == null || req.body.idOfVisitor == undefined) {
        await userModel.findOne({ number: req.body.contactNumberOfVisitor }, (err, visitorUser) => {
            // console.log("visitorUser")
            // console.log(visitorUser)
            visitor.idOfVisitor = visitorUser.id
            console.log("Id of visitor " + visitor.idOfVisitor)
        })
    }
    console.log(" this is visitor")
    console.log(visitor)

    visitor.contactNumberOfVisitor = req.body.contactNumberOfVisitor
    let visitorModelObject = await visitorModel(visitor)
    console.log("visitorModelObject")
    console.log(visitorModelObject)
    await visitorModelObject.save((err, docs) => {
        if (!err) {
            console.log("Visitor Model Saved Successfully")
        } else {
            console.log(err)
        }
    })
    let pendingEntryRequest = visitor
    pendingEntryRequest.userIdOfTheBusinessCalendar = userIdOfTheBusinessCalendar


    // FOR PUSHING PENDING ENTRY REQUESTS IN USERS DB WHO HAVE PERMISSION OF THIS FLAT
    securityCalendarModel.findOne({ userId: userIdOfTheBusinessCalendar }, (err, securityCalendar) => {
        if (err) {
            console.log(err)
        } else {
            if ((securityCalendar.subscriberArray).length > 0) {
                for (subscribedUser of securityCalendar.subscriberArray) {
                    if (subscribedUser.houseNumber == visitor.houseNumber) {
                        userModel.findOne({ _id: subscribedUser.userIdOfSubscriber }, (err, hostUserAgain) => {
                            pendingEntryRequest.idOfHost = `${visitor.idOfHost}`
                            userModel.findOne({ number: req.body.contactNumberOfVisitor }, (err, visitorUserAgain) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    pendingEntryRequest.idOfVisitor = visitorUserAgain._id
                                    console.log(visitorUserAgain._id + "  id")
                                    console.log("pendingEntryRequest inside")
                                    console.log(pendingEntryRequest)
                                    console.log(hostUserAgain.entryRequestArray)
                                    hostUserAgain.entryRequestArray.push(pendingEntryRequest)
                                    hostUserAgain.save();

                                    // SENDING EMAIL TO USER WHO IS THE REAL OWNER OF THE FLAT
                                    userModelFunctions.sendEmail(userEmail.notificationEmail, hostUserAgain.email, "Entry Request Pending For Your Approval", `Dear User, Someone has requested entry on the gate for your flat '${visitor.houseNumber}', Please approve in the system.`)
                                }
                            })
                        })
                    }
                }
            }
            if ((securityCalendar.flatPermissionSharedArray).length > 0) {
                for (flatPermissionSharedUser of securityCalendar.flatPermissionSharedArray) {
                    if (flatPermissionSharedUser.houseNumber == visitor.houseNumber && flatPermissionSharedUser.adminRights == true) {
                        userModel.findOne({ _id: flatPermissionSharedUser.userIdOfTheUserWhoGotPermissionOfFlatByTheUserWhoSusbcribedGateKeeperCalendar }, (err, flatPermissionSharedUserAgain) => {
                            pendingEntryRequest.idOfHost = `${visitor.idOfHost}`
                            userModel.findOne({ number: req.body.contactNumberOfVisitor }, (err, visitorUserAgain) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    pendingEntryRequest.idOfVisitor = visitorUserAgain._id
                                        // console.log(visitorUserAgain._id + "  id")
                                    console.log("pendingEntryRequest inside")
                                    console.log(pendingEntryRequest)
                                        // console.log(flatPermissionSharedUserAgain.entryRequestArray)
                                    flatPermissionSharedUserAgain.entryRequestArray.push(pendingEntryRequest)
                                    flatPermissionSharedUserAgain.save();
                                    if (flatPermissionSharedUser.recieveEmailNotificationOrNot == true) {
                                        // SENDING EMAIL TO USER WHO HAVE THE flatPermissionSharedUser
                                        userModelFunctions.sendEmail(userEmail.notificationEmail, flatPermissionSharedUserAgain.email, "Entry Request Pending For Your Approval", `Dear User, Someone has requested entry on the gate for your flat '${visitor.houseNumber}', Please approve in the system.`)
                                    }
                                }
                            })
                        })
                    }
                }
            }
        }
    })
    if (calendar) {
        pushVisitorintoSecurityCalendar({
            "userId": userIdOfTheBusinessCalendar,
            "visitorId": calendar.dailyVisitors[0].id,
            "visitors": visitor
        }, callback);
    } else {
        await securityCalendarModel.findOne({
            'allCalendarId': mongoose.Types.ObjectId(req.params.idOfCalendarForSecurityVehicleRecord)
        }).then((securityCalendar) => {
            if (securityCalendar) {
                var dailyVisitor = {
                    date: req.params.dateForSecurityVehicleRecord,
                    visitors: [visitor],
                    pendingEntryList: [visitor._id],
                    cancelledEntryList: [],
                    acceptedEntryList: [],
                    exited: []
                }
                securityCalendar.dailyVisitors.push(dailyVisitor);
                securityCalendar.save();
                callback(null, {
                    msg: "successfully added"
                });
            } else {
                callback(new Error("no security Calendar found!!"), null);
            }
        }).catch((err) => {
            console.log(err);
            callback(err, null);
        });
    }
}

async function pushVisitorintoSecurityCalendar(body, callback) {
    var calendar = await securityCalendarModel.findOne({
        'userId': body.userId,
        'dailyVisitors': {
            '$elemMatch': {
                '_id': body.visitorId
            }
        }
    }).select('dailyVisitors.$');
    // console.log(calendar);
    console.log(body.visitorId);
    console.log(body.visitors + "inside push function security")
    securityCalendarModel.updateOne({
            'userId': body.userId,
            'dailyVisitors': {
                '$elemMatch': {
                    '_id': body.visitorId
                }
            }
        }, {
            '$push': {
                'dailyVisitors.$.visitors': body.visitors
            },
            '$addToSet': {
                'dailyVisitors.$.pendingEntryList': body.visitors._id
            }
        },
        (err, doc) => {
            if (!err) {
                console.log(doc);
                if (doc.ok == 1) {
                    callback(null, {
                        msg: "successfully added"
                    });
                } else {
                    callback(new Error('error while adding!'), null);
                }
            } else {
                callback(err, null);
            }
        });
}



async function VisitorExited(userIdOfTheBusinessCalendar, date, VisitorId, callback) {
    let reportDetailObject = {}
    var calendar = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyVisitors.date': date
    }).select('dailyVisitors.$');
    if (calendar) {
        let visitor = await calendar.dailyVisitors[0].visitors;
        if (visitor) {
            let index = 0;
            for (element of visitor) {
                if (element.id == VisitorId) {
                    break;
                }
                index += 1;
            }
            let query = 'dailyVisitors.$.visitors.' + index + '.exitTime';
            var changeCalendar = await securityCalendarModel.updateOne({
                'userId': userIdOfTheBusinessCalendar,
                'dailyVisitors.date': date
            }, {
                '$addToSet': {
                    'dailyVisitors.$.exited': VisitorId
                },
                '$pull': {
                    'dailyVisitors.$.entered': VisitorId
                },
                '$set': {
                    [query]: Date.now()
                }
            }, (err, doc) => {
                if (doc.ok > 0) {
                    console.log(doc + " right")
                    callback(null, { msg: 'successfully Exited' });
                } else {
                    console.log(err)
                    callback(new Error('error while exiting!!'), null);
                }
            })
            securityCalendarModel.findOne({ 'dailyVisitors.date': date }, async(err, Details) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log("Details Below");
                    for (i = 0; i < Details.dailyVisitors.length; i++) {
                        if (Details.dailyVisitors[i].date === date) {
                            console.log("Date matched")
                            console.log(Details.dailyVisitors[i].visitors)
                            var VisitorArrayMadeByMe = Details.dailyVisitors[i].visitors;
                        }
                    }
                    console.log(VisitorArrayMadeByMe)
                    for (i = 0; i < VisitorArrayMadeByMe.length; i++) {
                        console.log("Inside For Loop")
                        console.log(VisitorArrayMadeByMe[i]._id + " " + VisitorId)
                        if (VisitorArrayMadeByMe[i]._id == VisitorId) {
                            reportDetailObject = VisitorArrayMadeByMe[i];
                            console.log(reportDetailObject)
                        }
                    }
                    await visitorModel.find({ _id: VisitorId }, async(err, foundUser) => {
                        if (err) {
                            console.log(err)
                        } else {
                            console.log("User found")
                            console.log(foundUser)
                            await userModel.findOne({ _id: foundUser[0].idOfHost }, (err, hostUser) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    userModelFunctions.sendEmail(userEmail.notificationEmail, hostUser.email, "Guest Exited", "One guest just exited from the society")
                                }
                            })
                            await visitorModel.updateOne({ _id: VisitorId }, { exitTime: Date.now() }, (err, docs) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    console.log("Inside update function")
                                    console.log(docs)
                                }
                            })
                        }
                    })
                }

            })

        } else {
            callback(new Error("no visitor found with the given information"), null);
        }
    } else {
        console.log(date)
        callback(new Error("no visitors yet on this date"), null);
    }
}
async function getSecurityVisitorofaDate(req, userIdOfTheBusinessCalendar, callback) {
    var calendar = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyVisitors.date': req.params.dateForSecurityVehicleRecord
    }).select('dailyVisitors.$');
    if (calendar) {
        let dailyVisitor = calendar.dailyVisitors[0];
        if (dailyVisitor) {
            callback(null, dailyVisitor);
        } else {
            callback(new Error("no visitors on this date found", null))
        }
    } else {
        callback(new Error("no visitors on this date found", null))
    }
}
async function getSecurityVisitors(req, callback) {
    var calendar = await securityCalendarModel.findById(req.body.calendarTypeId).select('dailyVisitors');
    if (calendar) {
        console.log(calendar);
        var today = new Date();
        var hour = today.getHours();
        var min = today.getMinutes();
        var todayDate = today.getDate() + "-" + today.getMonth() + "-" + today.getFullYear();
        var visitors = [];
        var Visitor = [];
        var index = 0;
        for (element of calendar.dailyVisitors) {
            var i = 0;
            if (element.date == todayDate) {
                for (el of element.visitors) {
                    if (i >= 3) {
                        break;
                    }
                    var starthour = el.entryTime.getHours();
                    var startmin = el.entryTime.getMinutes();
                    if (starthour >= hour && startmin > min) {
                        if (index > 1) {
                            Visitor.push(element.visitors[index]);
                            Visitor.push(element.visitors[index - 1]);
                            Visitor.push(element.visitors[index - 2])
                        } else if (index > 0) {
                            Visitor.push(element.visitors[index]);
                            Visitor.push(element.visitors[index - 1]);
                        } else {
                            Visitor.push(element.visitors[index]);
                        }
                        i = i + 1;
                    }
                }
            } else {
                for (el of element.visitors) {
                    if (i >= 3) {
                        break;
                    } else {
                        Visitor.push(el.visitorName);
                        i = i + 1;
                    }
                }
            }
            visitors.push({
                date: element.date,
                visitors: Visitor,
                count: element.visitors.length
            });
            index = index + 1;
        }
        if (visitors.length > 0) {
            callback(null, visitors);
        } else {
            callback(new Error("no visitors found!!"), null)
        }
    } else {
        callback(new Error("no calendar found!!"), null);
    }
}

// FUNCTION FOR GIVING VISITORS BY MEMBER USER ID
async function getSecurityVisitorsByHouseNumber(req, houseNumber, callback) {
    var calendar = await securityCalendarModel.findOne({ allCalendarId: req.params.calendarTypeId }).select('dailyVisitors');
    if (calendar) {
        let dailyVisitors = calendar.dailyVisitors
        console.log('houseNumber')
        console.log(houseNumber)
        for (singleDate of dailyVisitors) {
            for (let j = 0; j < (singleDate.visitors).length; j++) {
                if (singleDate.visitors[j].houseNumber === houseNumber) {
                    // console.log("houseNumber matched")
                    // console.log(singleDate.visitors[j])
                } else if (singleDate.visitors[j].houseNumber != houseNumber) {
                    console.log(singleDate.entered + "  singleDate.entered[i] up ")
                    console.log(singleDate.visitors[j]._id + "  singleDate.visito up rs[j]._id")
                    if ((singleDate.entered).length > 0) {
                        for (i = 0; i < (singleDate.entered).length; i++) {
                            console.log(singleDate.entered[i] + "  singleDate.entered[i]")
                            console.log(singleDate.visitors[j]._id + "  singleDate.visitors[j]._id")
                            if ((singleDate.visitors[j]._id).toString() === (singleDate.entered[i]).toString() && singleDate.visitors[j].houseNumber != houseNumber) {

                                singleDate.entered.splice(i, 1)
                                singleDate.visitors.splice(j, 1)
                                console.log('singleDate')
                                console.log(singleDate)
                            }
                        }
                    }
                    if ((singleDate.exited).length > 0) {
                        for (i = 0; i < (singleDate.exited).length; i++) {
                            if ((singleDate.visitors[j]._id).toString() == (singleDate.exited[i]).toString()) {

                                singleDate.exited.splice(i, 1)

                                singleDate.visitors.splice(j, 1)
                                    // console.log('singleDate')
                                    // console.log(singleDate)
                            }
                        }
                    }
                }
            }
        }
        if (dailyVisitors.length > 0) {
            callback(null, dailyVisitors);
        } else {
            callback(new Error("no visitors found!!"), null)
        }
    } else {
        callback(new Error("no calendar found!!"), null);
    }
}

async function addAppointmentRequestInSecurityCalendar(req, date, businessFound, uniqueIdForAppointment, callback) {
    securityCalendarModel.findOne({ userId: businessFound.userId, 'dailyAppointments.date': date }, async(err, businessCalendarFound) => {
        let dailyAppointmentsFromDatabase = await securityCalendarModel.findOne({
            userId: businessFound.userId,
            'dailyAppointments.date': date
        }).select('dailyAppointments.$');
        console.log(dailyAppointmentsFromDatabase)
        let appointments = {}
        for (element in req.body) {
            appointments[element] = req.body[element];
        }
        appointments.requester = req.user.name;
        appointments.requesterMobileNumber = req.user.number;
        appointments.requesterUserId = req.user._id;
        appointments.dateOfAppointment = date;
        appointments.appointmentApproved = "pending";
        appointments._id = uniqueIdForAppointment;

        // FOR REDUCING SIZE OF IMAGE AND MAKING IT PREVIEW IMAGE
        let imageNameForSharp = (((req.body.documentImageInScheduleOrAppointment).replace(".jpg", "")).replace(".png", "")).replace(".jpeg", "")
        console.log('imageNameForSharp')
        console.log(imageNameForSharp)
        sharp(`${req.body.documentImageInScheduleOrAppointment}`).resize(640, 480)
            .jpeg({ quality: 80 }).toFile(`${imageNameForSharp}_preview.jpg`);
        appointments.documentImageInScheduleOrAppointment = `${imageNameForSharp}_preview.jpg`

        console.log(appointments)
        if (!businessCalendarFound) {
            securityCalendarModel.findOne({ userId: businessFound.userId }, (err, securityCalendarToAddNewAppointment) => {
                console.log(securityCalendarToAddNewAppointment)
                let endTimeOfbefore = timeManipulation.decreaseByaMin(req.body.start);
                let startTimeOfAfter = timeManipulation.increaseByaMin(req.body.end);
                let dailyAppointment = {
                    date: date,
                    appointments: [appointments],
                    freeTime: [{
                        start: "00:00",
                        end: endTimeOfbefore
                    }, {
                        start: startTimeOfAfter,
                        end: "23:59"
                    }],
                    pendingAppointmentList: [appointments._id]
                }
                console.log("this is i want")
                console.log(dailyAppointment)

                securityCalendarToAddNewAppointment.dailyAppointments.push(dailyAppointment)
                console.log("this is i want again")
                console.log(securityCalendarToAddNewAppointment.dailyAppointments)
                securityCalendarToAddNewAppointment.save(function(err, savingObject) {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(savingObject)
                    }
                });
            })
        } else {
            securityCalendarModel.findOne({ userId: businessFound.userId, 'dailyAppointments.date': date }, (err, businessCalendarFoundAgain) => {
                console.log("Date Already Have One  Appointment.")
                for (let i = 0; i < businessCalendarFoundAgain.dailyAppointments.length; i++) {
                    if (businessCalendarFoundAgain.dailyAppointments[i].date === date) {
                        console.log(businessCalendarFoundAgain.dailyAppointments[i])
                        securityCalendarModel.updateOne({
                                userId: businessCalendarFound.userId,
                                'dailyAppointments': {
                                    '$elemMatch': {
                                        '_id': dailyAppointmentsFromDatabase.dailyAppointments[0].id
                                    }
                                }
                            }, {
                                '$set': {
                                    "dailyAppointments.$.freeTime": timeManipulation.calculateFreeTimeList(dailyAppointmentsFromDatabase.dailyAppointments[0].freeTime, appointments.start, appointments.end)
                                },
                                '$push': {
                                    'dailyAppointments.$.appointments': appointments
                                },
                                '$addToSet': {
                                    'dailyAppointments.$.pendingAppointmentList': appointments._id
                                }
                            },
                            (err, doc) => {
                                if (!err) {
                                    // console.log(doc);
                                    if (doc.ok == 1) {
                                        console.log("successfully added")
                                    } else {
                                        console.log('error while adding!')
                                    }
                                } else {
                                    console.log(err)
                                }
                            });
                    }
                }

            })

        }
    })
}


async function getAppointmentsofaDate(req, userIdOfTheBusinessCalendar, callback) {
    // let dailyUnapprovedAppointment = {}
    let dailyAppointmentsFromDatabase = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyAppointments.date': req.params.dateForSecurityVehicleRecord
    }).select('dailyAppointments.$');
    if (dailyAppointmentsFromDatabase) {
        let dailyAppointment = dailyAppointmentsFromDatabase.dailyAppointments[0];
        if (dailyAppointment) {

            console.log("dailyAppointment")
            console.log(dailyAppointment)
            callback(null, dailyAppointment);
        } else {
            callback(new Error("no dailyAppointment on this date found", null))
        }
    } else {
        callback(new Error("no dailyAppointment on this date found", null))
    }
}
async function acceptAppointmentFunction(req, userIdOfTheBusinessCalendar, callback) {
    let allAppointmentsOfParticularDate = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyAppointments.date': req.params.dateOfAppointment
    }).select('dailyAppointments.$');

    let appointmentsWeGotFromDatabase = allAppointmentsOfParticularDate.dailyAppointments[0].appointments;

    let appointmentsAfterUpdation = []

    for (let i = 0; i < appointmentsWeGotFromDatabase.length; i++) {
        if (appointmentsWeGotFromDatabase[i]._id == req.params.idOfAppointment) {
            appointmentsWeGotFromDatabase[i].appointmentApproved = "true"
            appointmentsAfterUpdation = appointmentsWeGotFromDatabase
            theMainAppointmentObjectWhichIsUpdated = appointmentsWeGotFromDatabase[i]
        }
    }

    securityCalendarModel.updateOne({
            userId: userIdOfTheBusinessCalendar,
            'dailyAppointments': {
                '$elemMatch': {
                    '_id': allAppointmentsOfParticularDate.dailyAppointments[0].id
                }
            }
        }, {
            '$addToSet': {
                'dailyAppointments.$.acceptedAppointmentList': req.params.idOfAppointment
            },
            '$pull': {
                'dailyAppointments.$.pendingAppointmentList': req.params.idOfAppointment
            },
            '$set': {
                'dailyAppointments.$.appointments': appointmentsAfterUpdation
            }
        },
        (err, doc) => {
            if (!err) {
                // console.log(doc);
                if (doc.ok == 1) {

                    console.log("successfully added")
                    callback(null, doc)

                } else {
                    console.log('error while adding!')
                }
            } else {
                console.log(err)
            }
        });
}
async function acceptEntryRequestFunction(req, userIdOfTheBusinessCalendar, callback) {
    let allVisitorsOfParticularDate = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyVisitors.date': req.params.visitingDate
    }).select('dailyVisitors.$');
    let visitorsWeGotFromDatabase = allVisitorsOfParticularDate.dailyVisitors[0].visitors;

    let visitorsAfterUpdation = []
    let theMainEntryObjectWhichIsUpdated = {}
    for (i of visitorsWeGotFromDatabase) {
        if (i._id == req.params.VisitorId) {
            i.entryApproved = "true";
            i.entryTime = Date.now();
            i.entryApprovedOrCancelledByUserId = req.user.id;
            visitorsAfterUpdation = visitorsWeGotFromDatabase;
            theMainEntryObjectWhichIsUpdated = i;
            console.log('idOfHost')
            console.log(i.idOfHost)
            userModel.find({ _id: i.idOfHost }, (err, hostFoundForAccepting) => {
                if (err) {
                    console.log(err)
                } else {
                    userModel.findOne({ _id: req.user.id }, (err, userWhoAcceptedTheRequest) => {
                        if (err) {
                            console.log(err)
                        } else {
                            console.log("hostFoundForAccepting")
                            console.log(hostFoundForAccepting)
                            userModelFunctions.sendEmail(userEmail.notificationEmail, hostFoundForAccepting[0].email, "Entry has been approved", `Entry has been accepted by ${userWhoAcceptedTheRequest.name}`)
                            userModelFunctions.sendEmail(userEmail.notificationEmail, hostFoundForAccepting[0].email, "Guest for you", "Guest has just entered in the society ")

                            securityCalendarModel.findOne({ userId: userIdOfTheBusinessCalendar }, (err, securityCalendar) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    if ((securityCalendar.subscriberArray).length > 0) {
                                        for (subscribedUser of securityCalendar.subscriberArray) {
                                            if (subscribedUser.userIdOfSubscriber == i.idOfHost) {
                                                // FOR REMOVING PENDING ENTRY REQUESTS FROM USERS DB WHO HAVE PERMISSION OF THIS FLAT
                                                userModel.updateOne({ _id: i.idOfHost }, { '$pull': { 'entryRequestArray': { '_id': req.params.VisitorId } } }, { safe: true, multi: true }, (err, doc) => {
                                                    if (err) {
                                                        console.log(err)
                                                    } else {
                                                        console.log("Accepted Entry in usermodel of flat owner")
                                                        console.log(doc)
                                                    }
                                                })
                                            }
                                        }
                                    }
                                    if ((securityCalendar.flatPermissionSharedArray).length > 0) {
                                        for (flatPermissionSharedUser of securityCalendar.flatPermissionSharedArray) {
                                            if (flatPermissionSharedUser.userIdOfTheUserWhoSubscribedTheGateKeeperCalendar == i.idOfHost && flatPermissionSharedUser.adminRights === true) {
                                                userModel.findOne({ _id: flatPermissionSharedUser.userIdOfTheUserWhoGotPermissionOfFlatByTheUserWhoSusbcribedGateKeeperCalendar }, (err, flatPermissionSharedUserAgain) => {
                                                    if (err) {
                                                        console.log(err)
                                                    } else {
                                                        console.log('flatPermissionSharedUser')
                                                        console.log(flatPermissionSharedUser)
                                                        console.log('flatPermissionSharedUserAgain')
                                                        console.log(flatPermissionSharedUserAgain)
                                                        userModel.updateOne({ _id: flatPermissionSharedUserAgain._id }, { '$pull': { 'entryRequestArray': { '_id': req.params.VisitorId } } }, { safe: true, multi: true }, (err, doc) => {
                                                            if (err) {
                                                                console.log(err)
                                                            } else {
                                                                console.log("Accepted Entry in usermodel of flat non-owner")
                                                                console.log(doc)
                                                            }
                                                        })
                                                        if (flatPermissionSharedUser.recieveEmailNotificationOrNot == true) {
                                                            // SENDING EMAIL TO USER WHO HAVE THE flatPermissionSharedUser
                                                            userModelFunctions.sendEmail(userEmail.notificationEmail, flatPermissionSharedUserAgain.email, "Entry has been approved", `Entry has been accepted by ${userWhoAcceptedTheRequest.name}`)
                                                            userModelFunctions.sendEmail(userEmail.notificationEmail, flatPermissionSharedUserAgain.email, "Guest for you", "Guest has just entered in the society.")
                                                        } else {
                                                            console.log("Permission is not given for email")
                                                        }
                                                    }
                                                })
                                            }
                                        }
                                    }
                                }
                            })
                        }
                    })
                }
            })
        }
    }
    console.log("visitorsAfterUpdation")
    console.log(visitorsAfterUpdation)
    await visitorModel.find({ _id: req.params.VisitorId }, async(err, foundUser) => {
        if (err) {
            console.log(err)
        } else {
            console.log("User found")
                // console.log(foundUser)
            await visitorModel.updateOne({ _id: req.params.VisitorId }, { $set: { entryTime: Date.now(), entryApproved: "true", entryApprovedOrCancelledByUserId: req.user.id, idOfVisitor: theMainEntryObjectWhichIsUpdated.idOfVisitor, idOfHost: theMainEntryObjectWhichIsUpdated.idOfHost } }, (err, docs) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log("Inside update function")
                    console.log(docs)
                }
            })
        }
    })
    securityCalendarModel.updateOne({
            userId: userIdOfTheBusinessCalendar,
            'dailyVisitors': {
                '$elemMatch': {
                    '_id': allVisitorsOfParticularDate.dailyVisitors[0].id
                }
            }
        }, {
            '$addToSet': {
                'dailyVisitors.$.entered': req.params.VisitorId
            },
            '$pull': {
                'dailyVisitors.$.pendingEntryList': req.params.VisitorId
            },
            '$set': {
                'dailyVisitors.$.visitors': visitorsAfterUpdation
            }
        },
        (err, doc) => {
            if (!err) {
                // console.log(doc);
                if (doc.ok == 1) {

                    console.log("successfully added")
                    callback(null, doc)

                } else {
                    console.log('error while adding!')
                }
            } else {
                console.log(err)
            }
        });
}
async function cancelEntryRequestFunction(req, userIdOfTheBusinessCalendar, callback) {
    let allVisitorsOfParticularDate = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyVisitors.date': req.params.visitingDate
    }).select('dailyVisitors.$');
    console.log("allVisitorsOfParticularDate")
    console.log(allVisitorsOfParticularDate)
    let visitorsWeGotFromDatabase = allVisitorsOfParticularDate.dailyVisitors[0].visitors;
    console.log("visitorsWeGotFromDatabase")
    console.log(visitorsWeGotFromDatabase)

    let visitorsAfterUpdation = []

    for (i of visitorsWeGotFromDatabase) {
        if (i._id == req.params.VisitorId) {
            i.entryApproved = "cancel";
            i.cancelledTime = Date.now();
            i.entryApprovedOrCancelledByUserId = req.user.id;
            visitorsAfterUpdation = visitorsWeGotFromDatabase;
            theMainAppointmentObjectWhichIsUpdated = i;
            await userModel.find({ _id: i.idOfHost }, (err, hostFoundForAccepting) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log("hostFoundForAccepting")
                    console.log(hostFoundForAccepting)
                    userModel.updateOne({ _id: i.idOfHost }, { '$pull': { 'entryRequestArray': { '_id': req.params.VisitorId } } }, { safe: true, multi: true }, (err, doc) => {
                        if (err) {
                            console.log(err)
                        } else {
                            console.log("Cancelled Entry in usermodel")
                            console.log(doc)
                        }
                    })
                }
            })

        }
    }
    console.log("visitorsAfterUpdation")
    console.log(visitorsAfterUpdation)
    await visitorModel.find({ _id: req.params.VisitorId }, async(err, foundUser) => {
        if (err) {
            console.log(err)
        } else {
            console.log("User found")
            console.log(foundUser)
            await visitorModel.updateOne({ _id: req.params.VisitorId }, { $set: { cancelledTime: Date.now(), entryApproved: "cancel", entryApprovedOrCancelledByUserId: req.user.id, idOfVisitor: theMainAppointmentObjectWhichIsUpdated.idOfVisitor, idOfHost: theMainAppointmentObjectWhichIsUpdated.idOfHost } }, (err, docs) => {
                if (err) {
                    console.log(err)
                } else {
                    console.log("Inside update function")
                    console.log(docs)
                }
            })
        }
    })

    securityCalendarModel.updateOne({
            userId: userIdOfTheBusinessCalendar,
            'dailyVisitors': {
                '$elemMatch': {
                    '_id': allVisitorsOfParticularDate.dailyVisitors[0].id
                }
            }
        }, {
            '$addToSet': {
                'dailyVisitors.$.cancelledEntryList': req.params.VisitorId
            },
            '$pull': {
                'dailyVisitors.$.pendingEntryList': req.params.VisitorId
            },
            '$set': {
                'dailyVisitors.$.visitors': visitorsAfterUpdation
            }
        },
        (err, doc) => {
            if (!err) {
                // console.log(doc);
                if (doc.ok == 1) {

                    console.log("successfully added")
                    callback(null, doc)

                } else {
                    console.log('error while adding!')
                }
            } else {
                console.log(err)
            }
        });
}
async function cancelAppointmentFunction(req, userIdOfTheBusinessCalendar, callback) {
    let allAppointmentsOfParticularDate = await securityCalendarModel.findOne({
        'userId': userIdOfTheBusinessCalendar,
        'dailyAppointments.date': req.params.dateOfAppointment
    }).select('dailyAppointments.$');

    let appointmentsWeGotFromDatabase = allAppointmentsOfParticularDate.dailyAppointments[0].appointments;
    for (let i = 0; i < appointmentsWeGotFromDatabase.length; i++) {
        if (appointmentsWeGotFromDatabase[i]._id === req.params.idOfAppointment) {
            myAppointmentOfRequesterEnd = await privateCalendarModel.findOne({
                'userId': appointmentsWeGotFromDatabase[i].requesterUserId,
                'dailySchedules.date': req.params.dateOfAppointment
            }).select('dailySchedules.$')
        }
    }
    let appointmentsAfterUpdation = []

    for (let i = 0; i < appointmentsWeGotFromDatabase.length; i++) {
        if (appointmentsWeGotFromDatabase[i]._id == req.params.idOfAppointment) {
            appointmentsWeGotFromDatabase[i].appointmentApproved = "cancel"
            appointmentsAfterUpdation = appointmentsWeGotFromDatabase
            theMainAppointmentObjectWhichIsUpdated = appointmentsWeGotFromDatabase[i]
        }
    }
    securityCalendarModel.updateOne({
            userId: userIdOfTheBusinessCalendar,
            'dailyAppointments': {
                '$elemMatch': {
                    '_id': allAppointmentsOfParticularDate.dailyAppointments[0].id
                }
            }
        }, {
            '$addToSet': {
                'dailyAppointments.$.cancelledAppointmentList': req.params.idOfAppointment
            },
            '$pull': {
                'dailyAppointments.$.pendingAppointmentList': req.params.idOfAppointment
            },
            '$set': {
                'dailyAppointments.$.appointments': appointmentsAfterUpdation
            }
        },
        (err, doc) => {
            if (!err) {
                // console.log(doc);
                if (doc.ok == 1) {
                    console.log("successfully added")
                    callback(null, doc)
                } else {
                    console.log('error while adding!')
                }
            } else {
                console.log(err)
            }
        });
}


async function editAppointmentIntoSecurityCalendar(req, userIdOfBusinessUser, date, appointmentId, callback) {
    let allAppointmentsOfParticularDate = await securityCalendarModel.findOne({
        userId: userIdOfBusinessUser,
        'dailyAppointments.date': date
    }).select('dailyAppointments.$');
    let allAppointmentsAfterEditing = {}
    console.log("This is allAppointmentsOfParticularDate");
    console.log(allAppointmentsOfParticularDate);
    let detailedAppointmentsOfThisDate = allAppointmentsOfParticularDate.dailyAppointments[0].appointments
    console.log("This is detailedAppointmentsOfThisDate");
    console.log(detailedAppointmentsOfThisDate)
    if (detailedAppointmentsOfThisDate) {
        for (let i = 0; i < detailedAppointmentsOfThisDate.length; i++) {
            if (detailedAppointmentsOfThisDate[i]._id == appointmentId) {
                detailedAppointmentsOfThisDate[i].start = req.body.start
                detailedAppointmentsOfThisDate[i].end = req.body.end
                detailedAppointmentsOfThisDate[i].heading = req.body.heading
                detailedAppointmentsOfThisDate[i].description = req.body.description

                // FOR REDUCING SIZE OF IMAGE AND MAKING IT PREVIEW IMAGE
                let imageNameForSharp = (((req.body.documentImageInScheduleOrAppointment).replace(".jpg", "")).replace(".png", "")).replace(".jpeg", "")
                console.log('imageNameForSharp')
                console.log(imageNameForSharp)
                sharp(`${req.body.documentImageInScheduleOrAppointment}`).resize(640, 480)
                    .jpeg({ quality: 80 }).toFile(`${imageNameForSharp}_preview.jpg`);
                detailedAppointmentsOfThisDate[i].documentImageInScheduleOrAppointment = `${imageNameForSharp}_preview.jpg`
            }
        }

    } else {
        callback(new Error("No Security Calendar Found!!"), null)
    }
    console.log("This is allAppointmentsAfterEditing");
    console.log(allAppointmentsAfterEditing)
    securityCalendarModel.updateOne({
            'userId': userIdOfBusinessUser,
            'dailyAppointments': {
                '$elemMatch': {
                    'date': date
                }
            }
        }, {
            '$set': {
                'dailyAppointments.$.appointments': allAppointmentsAfterEditing
            }
        },
        (err, doc) => {
            if (!err) {

                if (doc.ok == 1) {
                    console.log("successfully edited in personal calendar")
                    callback(null, doc)
                } else {
                    console.log('error while adding!')
                }
            } else {
                console.log(err)
            }
        });
}
async function requestMembershipInSecurityCalendar(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.allCalendarId }, async(err, securityCalendar) => {
        console.log(securityCalendar)
        console.log(req.user._id)
        if (securityCalendar) {
            let subscriberArray = securityCalendar.subscriberArray
            let subscribedBusinessObject = {}
            let alreadyUserSubscribed = subscriberArray.find(subscribedUser => subscribedUser.userIdOfSubscriber == (req.user._id).toString());
            console.log(alreadyUserSubscribed)
            if (!alreadyUserSubscribed) {
                securityCalendar.pendingSubscriberArray.push({ status: "pending", userIdOfRequester: req.user._id, houseNumber: req.body.houseNumber })
                console.log('pendingSubscriberArray')
                console.log(securityCalendar.pendingSubscriberArray)
                securityCalendar.save()
                    // FOR SENDING EMAIL OF MEMBERSHIP REQUEST
                await userModel.findOne({ _id: securityCalendar.userId }, async(err, securityCalendarOwner) => {
                    if (err) {
                        console.log(err)
                    } else {
                        // SENDING EMAIL TO OWNER OF CALENDAR
                        userModelFunctions.sendEmail(userEmail.notificationEmail, securityCalendarOwner.email, "Membership request is pending", "A membership request is pending for your calendar")
                        console.log('securityCalendarOwner')
                        console.log(securityCalendarOwner)
                        for (calendar of securityCalendarOwner.userPermissionsGiven) {
                            console.log('calendar')
                            console.log(calendar)
                            if (calendar.businessCalendarTypeId == req.params.allCalendarId) {
                                await userModel.findOne({ _id: calendar.userIdOfUserWhoIsPermitted }, (err, userWhoHasPermissionOfCalendar) => {
                                    if (err || !userWhoHasPermissionOfCalendar) {
                                        console.log(err)
                                    } else {
                                        console.log('userWhoHasPermissionOfCalendar')
                                        console.log(userWhoHasPermissionOfCalendar)
                                        userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoHasPermissionOfCalendar.email, "Membership request is pending", "A membership request is pending for your calendar")
                                    }
                                })
                            }
                        }
                        // SENDING EMAIL TO USER WHO REQUESTED MEMBERSHIP

                        await allCalendarModel.findOne({ _id: req.params.allCalendarId }, (err, businessCalendar) => {
                            userModelFunctions.sendEmail(userEmail.notificationEmail, req.user.email, "You requested membership.", `You requested membership for ${businessCalendar.businessName}`)
                        })

                    }
                })

                subscribedBusinessObject.userIdOfTheBusinessCalendar = securityCalendar.userId
                subscribedBusinessObject.businessCalendarTypeId = securityCalendar.allCalendarId
                subscribedBusinessObject.businessCalendarType = 'gateKeeper'
                subscribedBusinessObject.subscription = 'pending'
                subscribedBusinessObject.houseNumber = req.body.houseNumber
                userModel.findOne({ _id: req.user._id }, async(err, user) => {
                    if (err) {
                        callback(new Error("User not found"), null)
                    } else {
                        console.log('subscribedBusinessObject')
                        console.log(subscribedBusinessObject)
                        user.gateKeeperMembershipCalendars.push(subscribedBusinessObject)
                        user.save()

                    }
                })
                callback(null, "done")
            } else {
                callback(new Error("User Already Subscribed"), null)
            }
        } else {
            callback(new Error("No notice board calendar found!!"), null)
        }
    })
}
async function cancelRequestMembershipSecurityCalendar(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.allCalendarId }, async(err, securityCalendar) => {
        // console.log(securityCalendar)
        console.log(req.user._id)
        if (securityCalendar) {
            // FOR SENDING EMAIL OF CANCELLING OF MEMBERSHIP REQUEST
            await userModel.findOne({ _id: securityCalendar.userId }, async(err, securityCalendarOwner) => {
                if (err) {
                    console.log(err)
                } else {
                    // SENDING EMAIL TO OWNER OF CALENDAR
                    userModelFunctions.sendEmail(userEmail.notificationEmail, securityCalendarOwner.email, "Membership  request is cancelled.", 'A membership request is cancelled for your calendar.')
                    console.log('securityCalendarOwner')
                    console.log(securityCalendarOwner)
                    for (calendar of securityCalendarOwner.userPermissionsGiven) {
                        console.log('calendar')
                        console.log(calendar)
                        if (calendar.businessCalendarTypeId == req.params.allCalendarId) {
                            await userModel.findOne({ _id: calendar.userIdOfUserWhoIsPermitted }, (err, userWhoHasPermissionOfCalendar) => {
                                if (err || !userWhoHasPermissionOfCalendar) {
                                    console.log(err)
                                } else {
                                    console.log('userWhoHasPermissionOfCalendar')
                                    console.log(userWhoHasPermissionOfCalendar)
                                    userWhoHasPermissionOfCalendar
                                    userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoHasPermissionOfCalendar.email, "Membership is request is cancelled.", "A membership request is cancelled for your calendar.")
                                }
                            })
                        }
                    }
                    // SENDING EMAIL TO USER WHOSE MEMBERSHIP REQUEST GOT CANCELLED 
                    await allCalendarModel.findOne({ _id: req.params.allCalendarId }, (err, businessCalendar) => {
                        userModelFunctions.sendEmail(userEmail.notificationEmail, req.user.email, "Your membership request has been cancelled.", `You cancelled your membership request of ${businessCalendar.businessName}`)
                    })
                }
            })
            let subscriberArray = securityCalendar.subscriberArray
            let subscribedBusinessObject = {}
            let alreadyUserSubscribed = subscriberArray.find(element => (element).toString() == (req.user._id).toString());
            if (!alreadyUserSubscribed) {
                securityCalendarModel.update({ 'allCalendarId': req.params.allCalendarId }, {
                    '$pull': { 'pendingSubscriberArray': { userIdOfRequester: req.user._id } },
                }, (err, docs) => {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(docs)

                    }
                })
                userModel.update({ '_id': req.user._id }, {
                    $pull: {
                        'gateKeeperMembershipCalendars': {
                            businessCalendarTypeId: securityCalendar.allCalendarId
                        }
                    }
                }, (err, docs) => {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(docs)
                    }
                })
                console.log("Done updated")
                callback(null, "done")
            } else {
                callback(new Error("User not have any pending request"), null)
            }
        } else {
            callback(new Error("No Security calendar found!!"), null)
        }
    })
}


async function subscribeSecurityCalendar(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.allCalendarId }, (err, securityCalendar) => {
        console.log(securityCalendar)
        console.log(req.params.requesterUserId)
        if (securityCalendar) {
            let subscriberArray = securityCalendar.subscriberArray
            let subscribedBusinessObject = {}
            let alreadyUserSubscribed = subscriberArray.find(element => (element).toString() == (req.user._id).toString());
            if (!alreadyUserSubscribed) {
                // FOR REMOVING THE REQUEST FROM PENDING MEMBERSHIP ARRAYS
                securityCalendarModel.update({ 'allCalendarId': req.params.allCalendarId }, {
                    '$pull': { 'pendingSubscriberArray': { userIdOfRequester: req.params.requesterUserId } },
                }, async(err, docs) => {
                    if (err) {
                        console.log(err)
                    } else {
                        console.log(docs)
                            // FOR SENDING EMAIL OF ACCEPTANCE OF MEMBERSHIP REQUEST
                        await userModel.findOne({ _id: securityCalendar.userId }, async(err, securityCalendarOwner) => {
                            if (err) {
                                console.log(err)
                            } else {
                                // SENDING EMAIL TO OWNER OF CALENDAR
                                userModelFunctions.sendEmail(userEmail.notificationEmail, securityCalendarOwner.email, "Membership  request is accepted.", `A membership request is accepted for your calendar by ${req.user.name}`)
                                console.log('securityCalendarOwner')
                                console.log(securityCalendarOwner)
                                for (calendar of securityCalendarOwner.userPermissionsGiven) {
                                    console.log('calendar')
                                    console.log(calendar)
                                    if (calendar.businessCalendarTypeId == req.params.allCalendarId) {
                                        await userModel.findOne({ _id: calendar.userIdOfUserWhoIsPermitted }, (err, userWhoHasPermissionOfCalendar) => {
                                            if (err || !userWhoHasPermissionOfCalendar) {
                                                console.log(err)
                                            } else {
                                                console.log('userWhoHasPermissionOfCalendar')
                                                console.log(userWhoHasPermissionOfCalendar)
                                                userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoHasPermissionOfCalendar.email, "Membership  request is accepted.", `A membership request is accepted for your calendar by ${req.user.name}`)
                                            }
                                        })
                                    }
                                }
                            }
                        })
                    }
                })
                userModel.update({ '_id': req.params.requesterUserId }, {
                        $pull: {
                            'gateKeeperMembershipCalendars': {
                                businessCalendarTypeId: securityCalendar.allCalendarId
                            }
                        }
                    }, async(err, docs) => {
                        if (err) {
                            console.log(err)
                        } else {
                            console.log(docs)
                                //  SEND EMAIL WHEN REQUEST ACCEPTED
                            await userModel.findOne({ _id: req.params.requesterUserId }, async(err, requesterUser) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    await allCalendarModel.findOne({ _id: req.params.allCalendarId }, (err, businessCalendar) => {
                                        // 
                                        userModelFunctions.sendEmail(userEmail.notificationEmail, requesterUser.email, "Membership request has been accepted.", `Your membership request has been accepted ${businessCalendar.businessName}`)
                                    })
                                }
                            })
                        }
                    })
                    // FOR INSERTING THE PENDING REQUEST TO ACCEPTED REQUEST
                securityCalendar.subscriberArray.push({ userIdOfSubscriber: req.params.requesterUserId, houseNumber: req.params.requesterHouseNumber })
                securityCalendar.save()
                subscribedBusinessObject.userIdOfTheBusinessCalendar = securityCalendar.userId
                subscribedBusinessObject.businessCalendarTypeId = securityCalendar.allCalendarId
                subscribedBusinessObject.businessCalendarType = 'gateKeeper'
                subscribedBusinessObject.subscription = 'Subscribed'
                subscribedBusinessObject.houseNumber = req.params.requesterHouseNumber
                userModel.findOne({ _id: req.params.requesterUserId }, (err, user) => {
                    if (err) {
                        callback(new Error("User not found"), null)
                    } else {
                        console.log('subscribedBusinessObject')
                        console.log(subscribedBusinessObject)
                        user.gateKeeperMembershipCalendars.push(subscribedBusinessObject)
                        user.save()
                    }
                })
                callback(null, "done")
            } else {
                callback(new Error("User Already Subscribed"), null)
            }
        } else {
            callback(new Error("No notice board calendar found!!"), null)
        }
    })
}

async function unSubscribeSecurityCalendar(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.allCalendarId }, (err, securityCalendar) => {
        let flatPermissionSharedArray = securityCalendar.flatPermissionSharedArray
        if (securityCalendar) {
            securityCalendarModel.update({ allCalendarId: req.params.allCalendarId }, {
                $pull: {
                    "subscriberArray": { userIdOfSubscriber: req.params.requesterUserId },
                    "flatPermissionSharedArray": { userIdOfTheUserWhoSubscribedTheGateKeeperCalendar: req.params.requesterUserId }
                }
                // ,
                // $pull: {
                //     "flatPermissionSharedArray": { userIdOfTheUserWhoSubscribedTheGateKeeperCalendar: req.params.requesterUserId }
                // }
            }, { multi: true }, async(err, doc) => {
                if (err) {
                    callback(new Error("Subscribers not updated"), null)
                } else {
                    console.log("Unsunscribed perfectly")
                    userModel.updateOne({ _id: req.params.requesterUserId }, {
                        $pull: { "gateKeeperMembershipCalendars": { "businessCalendarTypeId": req.params.allCalendarId } }
                    }, { multi: true }, async(err, anotherDoc) => {
                        if (err) {
                            callback(new Error("Business subscribed by user not updated"), null)
                        } else {
                            for (i of flatPermissionSharedArray) {
                                userModel.updateOne({ _id: i.userIdOfTheUserWhoGotPermissionOfFlatByTheUserWhoSusbcribedGateKeeperCalendar }, {
                                    $pull: { "gateKeeperMembershipCalendars": { "businessCalendarTypeId": req.params.allCalendarId } }
                                }, { multi: true }, async(err, doc1) => {
                                    if (err) {
                                        callback(new Error("Business subscribed by user not updated"), null)
                                    } else {
                                        console.log(doc1)
                                    }
                                })
                            }



                            // FOR SENDING EMAIL OF CANCELLATION OF MEMBERSHIP REQUEST
                            await userModel.findOne({ _id: securityCalendar.userId }, async(err, securityCalendarOwner) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    // SENDING EMAIL TO OWNER OF CALENDAR
                                    // securityCalendarOwner.email
                                    userModelFunctions.sendEmail(userEmail.notificationEmail, securityCalendarOwner.email, "Owner: Member has been removed", `A member has been removed from your calendar by ${req.user.name}.`)
                                    console.log('securityCalendarOwner')
                                    console.log(securityCalendarOwner)
                                    for (calendar of securityCalendarOwner.userPermissionsGiven) {
                                        console.log('calendar')
                                        console.log(calendar)
                                        if (calendar.businessCalendarTypeId == req.params.allCalendarId) {
                                            await userModel.findOne({ _id: calendar.userIdOfUserWhoIsPermitted }, (err, userWhoHasPermissionOfCalendar) => {
                                                if (err || !userWhoHasPermissionOfCalendar) {
                                                    console.log(err)
                                                } else {
                                                    console.log('userWhoHasPermissionOfCalendar')
                                                    console.log(userWhoHasPermissionOfCalendar)
                                                    userWhoHasPermissionOfCalendar
                                                    userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoHasPermissionOfCalendar.email, "Member has been removed", `A member has been removed from your calendar by ${req.user.name}.`)
                                                }
                                            })
                                        }
                                    }
                                }
                            })

                            // SENDING EMAIL TO USER WHO HAS BEEN UNSUBSCRIBED BY THIS BUSINESS CALENDAR
                            await userModel.findOne({ _id: req.params.requesterUserId }, async(err, requesterUser) => {
                                if (err) {
                                    console.log(err)
                                } else {
                                    await allCalendarModel.findOne({ _id: req.params.allCalendarId }, (err, businessCalendar) => {
                                        //
                                        userModelFunctions.sendEmail(userEmail.notificationEmail, requesterUser.email, "You are removed from membership.", `You are removed from membership by ${businessCalendar.businessName}`)
                                    })
                                }
                            })
                            console.log(anotherDoc)
                            callback(null, "done")
                        }
                    })
                    console.log('doc from here')
                    console.log(doc)
                }
            })
        } else {
            callback(new Error("No security  calendar found!!"), null)
        }
    })
}

async function giveFlatMembershipToAnotherUser(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.idOfCalendarForSecurityVehicleRecord }, (err, securityCalendar) => {
        if (err) {
            callback(new Error("No security  calendar found!!"), null)
        } else {
            if (req.body.recieveEmailNotificationOrNot == null) {
                req.body.recieveEmailNotificationOrNot = false
            }
            if (req.body.recieveMsgNotificationOrNot == null) {
                req.body.recieveMsgNotificationOrNot = false
            }
            if (req.body.adminRights == "true") {
                req.body.adminRights = true
            } else if (req.body.adminRights == "false" || req.body.adminRights == null || req.body.adminRights == undefined) {
                req.body.adminRights = false
            }
            let objectToInsertInsideSecurityCalendar = {
                userIdOfTheUserWhoSubscribedTheGateKeeperCalendar: req.params.userIdOfTheMember,
                houseNumber: req.params.houseNumber,
                userIdOfTheUserWhoGotPermissionOfFlatByTheUserWhoSusbcribedGateKeeperCalendar: req.params.userIdOfUserWhoWillGetThePermissionOfThisFlat,
                adminRights: req.body.adminRights,
                recieveEmailNotificationOrNot: req.body.recieveEmailNotificationOrNot,
                recieveMsgNotificationOrNot: req.body.recieveMsgNotificationOrNot
            }


            // console.log(securityCalendar)
            console.log('securityCalendar')
            console.log(securityCalendar)

            // SAVING NEWLY CREATED OBJECT INSIDE SECURITY CALENDAR
            securityCalendar.flatPermissionSharedArray.push(objectToInsertInsideSecurityCalendar)
            securityCalendar.save()

            // SAVING OBJECT IN USER WHO JUST RECEIVED THE PERMISSION OF A FLAT 
            userModel.findOne({ _id: req.params.userIdOfUserWhoWillGetThePermissionOfThisFlat }, (err, userWhoWillGetThePermissionOfThisFlat) => {
                if (err) {
                    console.log(err)
                } else {
                    let objectToInsertInsideUserModel = {
                        userIdOfTheBusinessCalendar: securityCalendar.userId,
                        businessCalendarTypeId: req.params.idOfCalendarForSecurityVehicleRecord,
                        userIdOfMemberWhoSharedMembershipWithYou: req.params.userIdOfTheMember,
                        businessCalendarType: "gateKeeper",
                        subscription: "Subscribed",
                        adminRights: req.body.adminRights,
                        recieveEmailNotificationOrNot: req.body.recieveEmailNotificationOrNot,
                        recieveMsgNotificationOrNot: req.body.recieveMsgNotificationOrNot,
                        houseNumber: req.params.houseNumber
                    }
                    console.log('objectToInsertInsideUserModel')
                    console.log(objectToInsertInsideUserModel)
                    userWhoWillGetThePermissionOfThisFlat.gateKeeperMembershipCalendars.push(objectToInsertInsideUserModel)
                    userWhoWillGetThePermissionOfThisFlat.save()


                    // SENDING EMAIL TO USER WHO IS GETTING PERMISSION OF A FLAT
                    userModel.findOne({ _id: req.params.userIdOfTheMember }, (err, userWhoSubscribedTheGateKeeperCalendar) => {
                        if (err) {
                            console.log(err)
                        } else if (userWhoSubscribedTheGateKeeperCalendar) {
                            userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoWillGetThePermissionOfThisFlat.email, "Flat membership has been shared with you.", `Flat membership of flat "${req.params.houseNumber}" has been shared with you by ${userWhoSubscribedTheGateKeeperCalendar.name}`)
                        }
                    })

                }
            })
            callback(null, "done")
        }
    })
}


async function removeFlatMembershipFromTheUser(req, callback) {
    securityCalendarModel.findOne({ allCalendarId: req.params.idOfCalendarForSecurityVehicleRecord }, (err, securityCalendar) => {
        if (securityCalendar) {
            securityCalendarModel.updateOne({ allCalendarId: req.params.idOfCalendarForSecurityVehicleRecord }, {
                $pull: { "flatPermissionSharedArray": { userIdOfTheUserWhoGotPermissionOfFlatByTheUserWhoSusbcribedGateKeeperCalendar: req.params.userIdOfUserWhoWillGetThePermissionOfThisFlat } }
            }, (err, doc) => {
                if (err) {
                    callback(new Error("Subscribers not updated"), null)
                } else {
                    userModel.updateOne({ _id: req.params.userIdOfUserWhoWillGetThePermissionOfThisFlat }, {
                        $pull: { "gateKeeperMembershipCalendars": { "businessCalendarTypeId": req.params.idOfCalendarForSecurityVehicleRecord } }
                    }, async(err, anotherDoc) => {
                        if (err) {
                            callback(new Error("Business subscribed by user not updated"), null)
                        } else {
                            callback(null, "done")

                            // SENDING EMAIL TO USER WHO HAD FLAT MEMBERSHIP BY OTHER USER
                            userModel.findOne({ _id: req.params.userIdOfTheMember }, (err, userWhoSubscribedTheGateKeeperCalendar) => {
                                if (err) {
                                    console.log(err)
                                } else if (userWhoSubscribedTheGateKeeperCalendar) {
                                    userModel.findOne({ _id: req.params.userIdOfUserWhoWillGetThePermissionOfThisFlat }, (err, userWhoAlreadyHadThePermissionOfThisFlat) => {
                                        if (err) {
                                            console.log(err)
                                        } else if (userWhoAlreadyHadThePermissionOfThisFlat) {
                                            userModelFunctions.sendEmail(userEmail.notificationEmail, userWhoAlreadyHadThePermissionOfThisFlat.email, "Flat membership has been removed.", `Flat membership of flat "${req.params.houseNumber}" has been removed by ${userWhoSubscribedTheGateKeeperCalendar.name}`)
                                        }
                                    })
                                }
                            })
                        }
                    })
                    console.log(doc)
                }
            })
        } else {
            callback(new Error("No security  calendar found!!"), null)
        }
    })
}



module.exports = {
    getSecurityVisitors,
    getSecurityVisitorofaDate,
    addVisitorintoSecurityCalendar,
    getAppointmentsofaDate,
    acceptEntryRequestFunction,
    cancelEntryRequestFunction,
    VisitorExited,
    addAppointmentRequestInSecurityCalendar,
    acceptAppointmentFunction,
    cancelAppointmentFunction,
    editAppointmentIntoSecurityCalendar,
    requestMembershipInSecurityCalendar,
    cancelRequestMembershipSecurityCalendar,
    subscribeSecurityCalendar,
    unSubscribeSecurityCalendar,
    getSecurityVisitorsByHouseNumber,
    giveFlatMembershipToAnotherUser,
    removeFlatMembershipFromTheUser
}