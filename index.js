const config = require('./config.js');
const accountSid = config.twilio.accountSid;
const authToken = config.twilio.authToken;
const interval = config.interval;
const client = require('twilio')(accountSid, authToken);

//writeStats(fetchStats());
fetchStats();

function fetchStats() {
  console.log('Fetching TaskRouter Stats');

  const taskQueues = Object.keys(config.taskQueues);
  const workspace = config.twilio.workspace;
  let stats = {foo: 'bar'};

  if (typeof taskQueues === undefined) {
    console.log('No Task Queues defined');
    reject();
  }

  var fn = function queryTaskRouter(taskQueue) {
    const lastMidnight = new Date();
    lastMidnight.setHours(0,0,0,0); //last midnight
    const tomorrowMidnight = new Date();
    tomorrowMidnight.setDate(lastMidnight.getDate() + 1);
    const tomorrowMidnightHours = tomorrowMidnight.getHours();
    const startDate = `${lastMidnight.toISOString()}-${tomorrowMidnightHours}:00`;

    return client.taskrouter.workspaces(workspace)
      .taskQueues(taskQueue)
      .statistics({StartDate: startDate})
      .fetch()
  };

  let actions = taskQueues.map(fn);
  var results = Promise.all(actions);

  results.then(taskQueueStatistics => {
    let stats = {};

    taskQueueStatistics.forEach(function(taskQueueStatisticsInstance) {
      console.log(config);

      stats[taskQueueStatisticsInstance.taskQueueSid] = {
        name: config.taskQueues[taskQueueStatisticsInstance.taskQueueSid].name,
        tasksWaiting: taskQueueStatisticsInstance.realtime.tasks_by_status.pending,
        activeTasks: taskQueueStatisticsInstance.realtime.total_tasks,
        longestWait: formatWaitTime(taskQueueStatisticsInstance.realtime.longest_task_waiting_age),
        activeAgents: taskQueueStatisticsInstance.realtime.total_eligible_workers,
        totalAnswered: taskQueueStatisticsInstance.cumulative.reservations_accepted,
        abandonedTasks: taskQueueStatisticsInstance.cumulative.tasks_canceled,
        answeredPercent: (taskQueueStatisticsInstance.cumulative.reservations_accepted / taskQueueStatisticsInstance.cumulative.tasks_entered) * 100,
        averageSpeedOfAnswer: taskQueueStatisticsInstance.cumulative.avg_task_acceptance_time
      }
    })

    console.log(stats);
    return stats;
  })
  .then(stats => {
    const syncService = config.twilio.syncService;
    const syncMap = config.twilio.syncMap;
    const taskQueues = Object.keys(config.taskQueues);

    var fn = function writeToSyncMap(taskQueue) {

      return client.sync.services(syncService)
        .syncMaps(syncMap)
        .syncMapItems(taskQueue)
        .update({ data: stats[taskQueue] })
    };

    let actions = taskQueues.map(fn);
    var results = Promise.all(actions);

    results.then(syncMapItems => {
      const currentdate = new Date();
      const datetime = "Last Sync: "
        + (currentdate.getMonth()+1)  + "/"
        + currentdate.getDate() + "/"
        + currentdate.getFullYear() + " @ "
        + currentdate.getHours() + ":"
        + currentdate.getMinutes() + ":"
        + currentdate.getSeconds();

      console.log(`Updated Sync map at ${datetime}`);

      syncMapItems.forEach(syncMapItem => {
        console.log(syncMapItem.data);
      })
    });
  })

  results.catch(error => {
    console.log(error);
  });

  console.log(stats);

  return stats;
};

function formatWaitTime(waitTime) {
  const minutes = Math.floor(waitTime / 60),
        seconds = Math.floor(waitTime - (minutes * 60));
  return minutes + ':' + (seconds < 10 ? '0' + seconds : seconds);
}
