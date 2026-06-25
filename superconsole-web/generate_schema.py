import pexpect
import sys

def main():
    print("Starting drizzle-kit generate...")
    child = pexpect.spawn("npm run db:generate", encoding='utf-8')
    child.logfile = sys.stdout

    while True:
        try:
            # Wait for either the end of file, or an interactive prompt
            index = child.expect([
                pexpect.EOF,
                r"Is .* column .* created or renamed from another column\?",
                r"Is .* table .* created or renamed from another table\?",
                r"Are you sure you want to drop .* column\?"
            ], timeout=15)

            if index == 0:
                break
            elif index in [1, 2]:
                # It asks if it's created or renamed. The default is 'create', so we just send Enter.
                print("Prompt detected, sending Enter")
                child.send("\r")
            elif index == 3:
                # Are you sure you want to drop column? -> Send y
                print("Prompt detected, sending y")
                child.send("y\r")
                
        except pexpect.TIMEOUT:
            print("Timeout reached")
            break
            
    child.close()
    print("Exit code:", child.exitstatus)
    sys.exit(child.exitstatus)

if __name__ == '__main__':
    main()
