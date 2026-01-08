import os
import json
import subprocess

DOCUFLOW_DIR = "/home/hendrik/DocuFlow"
SPECS_DIR = os.path.join(DOCUFLOW_DIR, ".auto-claude/specs")

def check_merged(branch_name):
    try:
        # Check if branch exists
        subprocess.run(["git", "-C", DOCUFLOW_DIR, "rev-parse", "--verify", branch_name], 
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Check if merged
        result = subprocess.run(["git", "-C", DOCUFLOW_DIR, "merge-base", "--is-ancestor", branch_name, "main"],
                                check=False)
        return result.returncode == 0
    except subprocess.CalledProcessError:
        return None # Branch does not exist

def main():
    if not os.path.exists(SPECS_DIR):
        print(f"Specs dir not found: {SPECS_DIR}")
        return

    print(f"{'Task ID':<50} | {'Status':<15} | {'Branch':<40} | {'Merged?'}")
    print("-" * 120)

    for item in sorted(os.listdir(SPECS_DIR)):
        spec_path = os.path.join(SPECS_DIR, item)
        if not os.path.isdir(spec_path):
            continue

        plan_path = os.path.join(spec_path, "implementation_plan.json")
        if not os.path.exists(plan_path):
            continue

        try:
            with open(plan_path, 'r') as f:
                plan = json.load(f)
            
            status = plan.get('status', 'unknown')
            if status in ['done', 'completed']:
                branch_name = f"auto-claude/{item}"
                is_merged = check_merged(branch_name)
                
                merged_str = "YES" if is_merged else "NO"
                if is_merged is None:
                    merged_str = "Branch Missing"
                
                print(f"{item:<50} | {status:<15} | {branch_name:<40} | {merged_str}")
        except Exception as e:
            print(f"Error checking {item}: {e}")

if __name__ == "__main__":
    main()
