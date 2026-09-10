import urllib.request, json
try:
    req = urllib.request.Request('https://api.github.com/repos/anand-esc/Pheonix_37/actions/runs', headers={'User-Agent': 'Mozilla/5.0'})
    resp = urllib.request.urlopen(req)
    data = json.loads(resp.read())
    run_id = data['workflow_runs'][0]['id']
    print(f'Run ID: {run_id}')
    jobs_url = data['workflow_runs'][0]['jobs_url']
    req2 = urllib.request.Request(jobs_url, headers={'User-Agent': 'Mozilla/5.0'})
    resp2 = urllib.request.urlopen(req2)
    jobs_data = json.loads(resp2.read())
    for job in jobs_data['jobs']:
        print(f"Job {job['name']}: {job['conclusion']}")
        for step in job['steps']:
            if step['conclusion'] == 'failure':
                print(f"  Failed step: {step['name']}")
                
                # Fetch logs for the job
                log_url = f"https://api.github.com/repos/anand-esc/Pheonix_37/actions/jobs/{job['id']}/logs"
                try:
                    req_log = urllib.request.Request(log_url, headers={'User-Agent': 'Mozilla/5.0'})
                    resp_log = urllib.request.urlopen(req_log)
                    print(resp_log.read().decode()[-2000:]) # print last 2000 chars of the log
                except Exception as e2:
                    print(f"Could not fetch logs: {e2}")
except Exception as e:
    print(e)
