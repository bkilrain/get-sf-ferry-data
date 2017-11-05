const axios = require('axios')
const moment = require('moment-timezone')
const AWS = require('aws-sdk')

AWS.config.update({
  region: 'us-east-1',
  // endpoint: "http://localhost:8000"
  endpoint: 'https://dynamodb.us-east-1.amazonaws.com'

})

const dynamodb = new AWS.DynamoDB()

const API_TOKEN = process.env.API_TOKEN
const TABLE_NAME = process.env.TABLE_NAME

/* =============================================================================
 * ---------------------- Section 1. Data and Text strings ---------------------
 * =============================================================================
 */

// stops
const VALLEJO = 'vallejo'
const HARBOR_BAY = 'harbor bay'
const ALAMEDA_MAIN_STREET = 'alameda main street'
const SF_FERRY_BUILDING = 'san francisco ferry building'
const SOUTH_SF = 'south san francisco'
const OAKLAND = 'oakland jack london square'
const PIER_41 = 'pier 41'
const STOPS = [
  VALLEJO,
  HARBOR_BAY,
  ALAMEDA_MAIN_STREET,
  SF_FERRY_BUILDING,
  SOUTH_SF,
  OAKLAND,
  PIER_41
]

// lines
const VALLEJO_SF = 'Vallejo-SF'
const ALA_OAK_SF = 'Ala-Oak-SF'
const HARBOR_BAY_SF = 'Harbor Bay-SF'
const SOUTH_SF_EAST_BAY = 'South SF-East Bay'
const SOUTH_SF_SF = 'South SF-SF'

const TIMEZONE = 'America/Los_Angeles'

function terminalIds (terminal) {
  // hardcoded terminal ids
  switch (terminal) {
    case VALLEJO:
      return ['12149044']
    case SOUTH_SF:
      return ['12030041']
    case PIER_41:
      return ['12048538']
    case SF_FERRY_BUILDING:
      return ['890001', '12048537']
    case OAKLAND:
      return ['12030043']
    case HARBOR_BAY:
      return ['12048536']
    case ALAMEDA_MAIN_STREET:
      return ['12030044', '12030042']
  }
  return []
}

function getLines (departure, arrival) {
  // Need a better way to map departure and arrival terminals to correct lines
  let lines
  departure = departure.toLowerCase()
  if (departure === VALLEJO || arrival === VALLEJO) {
    lines = [VALLEJO_SF]
  } else if (departure === HARBOR_BAY || arrival === HARBOR_BAY) {
    lines = [HARBOR_BAY_SF]
  } else if (departure === SF_FERRY_BUILDING) {
    switch (arrival) {
      case ALAMEDA_MAIN_STREET:
      case OAKLAND:
        lines = [ALA_OAK_SF]
        break
      case SOUTH_SF:
        lines = [SOUTH_SF_SF]
        break
      case PIER_41:
        lines = [VALLEJO_SF, ALA_OAK_SF]
        break
      default:
        lines = []
    }
  } else if (departure === SOUTH_SF) {
    switch (arrival) {
      case ALAMEDA_MAIN_STREET:
      case OAKLAND:
        lines = [SOUTH_SF_EAST_BAY]
        break
      case SF_FERRY_BUILDING:
        lines = [SOUTH_SF_SF]
        break
      default:
        lines = []
    }
  } else if (departure === PIER_41) {
    switch (arrival) {
      case VALLEJO:
        lines = [VALLEJO_SF]
        break
      case SF_FERRY_BUILDING:
        lines = [VALLEJO_SF, ALA_OAK_SF]
        break
      case ALAMEDA_MAIN_STREET:
      case OAKLAND:
        lines = [ALA_OAK_SF]
        break
      default:
        lines = []
    }
  } else if (departure === OAKLAND) {
    switch (arrival) {
      case SOUTH_SF:
        lines = [SOUTH_SF_EAST_BAY]
        break
      case ALAMEDA_MAIN_STREET:
      case SF_FERRY_BUILDING:
      case PIER_41:
        lines = [ALA_OAK_SF]
        break
      default:
        lines = []
    }
  } else if (departure === ALAMEDA_MAIN_STREET) {
    switch (arrival) {
      case SOUTH_SF:
        lines = [SOUTH_SF_EAST_BAY]
        break
      case OAKLAND:
        lines = [SOUTH_SF_EAST_BAY, ALA_OAK_SF]
        break
      case SF_FERRY_BUILDING:
      case PIER_41:
        lines = [ALA_OAK_SF]
        break
      default:
        lines = []
    }
  } else {
    lines = []
  }
  return lines
}

/* =============================================================================
 * ---------------------- Section 2. Utility Functions -------------------------
 * =============================================================================
 */

function GetNextFerryTimeHandler (departure, arrival) {
  const departures = terminalIds(departure)
  const arrivals = terminalIds(arrival)
  const lines = getLines(departure, arrival)

  if (lines.length > 0) {
    manageResponse(lines, departures, arrivals, departure, arrival)
  } else {
    // no line found
    console.log('LINE NOT FOUND')
    console.log('departure was  = ' + departure)
    console.log('arrival was  = ' + arrival)
  }
}

function parseData (response, departures, arrivals, isWeekday) {
  const data = JSON.parse(response.data.slice(1))
  const possibleRoutes = getPossibleRoutes(departures, arrivals, data, isWeekday)
  if (possibleRoutes) {
    return getDepartureTimes(possibleRoutes, data)
  } else {
    return null
  }
}

function determineNextDepartureTime (timesForRoutes, departures, arrivals) {
  const allDepartures = []
  for (let routeId in timesForRoutes) {
    const stopsTimesMatrix = timesForRoutes[routeId]

    for (let j = 0; j < stopsTimesMatrix.length; j++) {
      let isDepartureTimeRecorded = false
      let departureTime
      for (let col = 0; col < stopsTimesMatrix[j].length; col++) {
        let stop = stopsTimesMatrix[j][col][0]
        let time = stopsTimesMatrix[j][col][1]
        if (departures.indexOf(stop) >= 0) {
          departureTime = moment.tz(time, 'HH:mm:ss', TIMEZONE)
          isDepartureTimeRecorded = true
        } else if (isDepartureTimeRecorded && arrivals.indexOf(stop) >= 0) {
          allDepartures.push(departureTime)
          break
        }
      }
    }
  }
  return allDepartures
}

function manageResponse (lines, departures, arrivals, departure, arrival) {
  let linesToFetch = lines.map((line) => {
    return fetchHandler('timetable', line)
  })
  Promise.all(linesToFetch)
    .then((lineData) => {
      let allDepartures = {
        weekday: [],
        weekend: []
      }
      lineData.forEach((response) => {
        let timesForWeekdayRoutes = parseData(response, departures, arrivals, true)
        let timesForWeekendRoutes = parseData(response, departures, arrivals, false)
        if (timesForWeekdayRoutes) {
          allDepartures.weekday = allDepartures.weekday.concat(determineNextDepartureTime(timesForWeekdayRoutes, departures, arrivals))
        }
        if (timesForWeekendRoutes) {
          allDepartures.weekend = allDepartures.weekend.concat(determineNextDepartureTime(timesForWeekendRoutes, departures, arrivals))
        }
      })
      for (let dayType in allDepartures) {
        if (allDepartures[dayType].length > 0) {
          let deduped = []

          allDepartures[dayType].sort((a, b) => {
            return a.isBefore(b) ? -1 : 1
          })

          allDepartures[dayType] = allDepartures[dayType].map((t) =>
            t.format('HH:mm'))

          for (let i = 0; i < allDepartures[dayType].length; i++) {
            if (deduped[deduped.length - 1] !== allDepartures[dayType][i]) {
              deduped.push(allDepartures[dayType][i])
            }
          }

          const params = {
            Item: {
              'fromTo': {
                S: `${departure} - ${arrival} - ${dayType}`
              },
              'departureTimes': {
                S: deduped.join(',')
              }
            },
            ReturnConsumedCapacity: 'TOTAL',
            TableName: TABLE_NAME
          }
          dynamodb.putItem(params, function (err, data) {
            if (err) console.log(err, err.stack)       // an error occurred
            else console.log('[Successful Put]', data) // successful response
          })
        }
      }
    })
    .catch((err) => {
      console.error('error in timetable fetch for:', err)
    })
}

function isPossibleRoute (route, departures, arrivals, isWeekday) {
  const dayTypeCheck = isWeekday ? /Weekday$/ : /Weekend$/

  if (dayTypeCheck.test(route.Name)) {
    const points = route.pointsInSequence.PointOnRoute
    let hasDeparturePreviously = false
    for (let i = 0; i < points.length; i++) {
      const pointId = points[i].PointRef.ref
      if (hasDeparturePreviously && arrivals.indexOf(pointId) >= 0) {
        return true
      } else if (departures.indexOf(pointId) >= 0) {
        hasDeparturePreviously = true
      }
    }
  }
}

function getPossibleRoutes (departures, arrivals, data, isWeekday) {
  let possibleRoutes = []
  const routes = data.Content.ServiceFrame.routes.Route
  routes.forEach((route) => {
    if (isPossibleRoute(route, departures, arrivals, isWeekday)) {
      possibleRoutes.push(route.id)
    }
  })
  return possibleRoutes.length > 0 ? possibleRoutes : null
}

function getDepartureTimes (routes, data) {
  let routesTables = {}
  let timetables = data.Content.TimetableFrame
  timetables.forEach((timetable) => {
    routes.forEach((route) => {
      const routeCheck = new RegExp(route)
      if (routeCheck.test(timetable.id)) {
        const routeMatrix = []
        let journeys = timetable.vehicleJourneys.ServiceJourney
        if (!Array.isArray(journeys)) {
          journeys = [journeys]
        }
        journeys.forEach((journey) => {
          const journeyRow = []
          journey.calls.Call.forEach((call) => {
            journeyRow.push([call.ScheduledStopPointRef.ref, call.Departure.Time])
          })
          routeMatrix.push(journeyRow)
        })
        routesTables[route] = routeMatrix
      }
    })
  })
  return routesTables
}

function fetchHandler (endpoint, ...args) {
  let url = `http://api.511.org/transit/${endpoint}?api_key=${API_TOKEN}&operator_id=San Francisco Bay Ferry`
  if (endpoint === 'timetable') {
    const line = args[0]
    url = url + `&line_id=${line}`
  }
  return axios.get(url)
}

/* =============================================================================
 * ---------------------- Section 3. Lambda Handler ----------------------------
 * =============================================================================
 */

exports.handler = () => {
  for (let i = 0; i < STOPS.length; i++) {
    for (let j = 0; j < STOPS.length; j++) {
      if (i === j) {
        continue
      }
      GetNextFerryTimeHandler(STOPS[i], STOPS[j])
    }
  }
}
