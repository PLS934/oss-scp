UPDATE collection_runs SET finish_authorized = false
  WHERE status = 'running' AND coordinated = true;
