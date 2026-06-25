import subprocess
import time

def main():
    # Pass 'yes' piped into the push command
    print("Running drizzle-kit push with 'yes' pipe")
    proc = subprocess.Popen(
        "yes '' | npm run db:push",
        shell=True,
        stdout=sys.stdout,
        stderr=sys.stderr
    )
    proc.wait()

if __name__ == "__main__":
    import sys
    main()
