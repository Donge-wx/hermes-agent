#!/bin/sh
set -eu

action=${1:-}
plan_path=${2:-}
plan_sha256=${3:-}
base_dir='/Library/Application Support/MyKing/EmployeeConnector'
label='com.myking.employee-connector'
plist_path="/Library/LaunchDaemons/${label}.plist"
newsyslog_path="/etc/newsyslog.d/${label}.conf"

plan_value() {
  /usr/bin/plutil -extract "$1" raw -o - "$plan_path"
}

remove_installed_key() {
  key_file="$base_dir/employee-authorized-key.pub"
  home_file="$base_dir/employee-home.txt"
  user_file="$base_dir/employee-user.txt"

  added_file="$base_dir/employee-authorized-key-added.txt"

  if [ ! -f "$key_file" ] || [ ! -f "$home_file" ] || [ ! -f "$user_file" ] || [ ! -f "$added_file" ]; then
    return
  fi

  if [ "$(/bin/cat "$added_file")" != '1' ]; then
    return
  fi

  installed_key=$(/bin/cat "$key_file")
  employee_home=$(/bin/cat "$home_file")
  employee_user=$(/bin/cat "$user_file")
  authorized_keys="$employee_home/.ssh/authorized_keys"

  if [ -f "$authorized_keys" ]; then
    if [ -L "$authorized_keys" ]; then exit 68; fi
    filtered_keys=$(/usr/bin/mktemp "$employee_home/.ssh/.myking-authorized-keys.XXXXXX")
    /usr/bin/grep -Fvx -- "$installed_key" "$authorized_keys" > "$filtered_keys" || true
    /bin/mv "$filtered_keys" "$authorized_keys"
    /usr/sbin/chown "$employee_user":staff "$authorized_keys"
    /bin/chmod 600 "$authorized_keys"
  fi
}

if [ "$action" = 'unbind' ]; then
  if [ -f "$plist_path" ]; then
    /bin/launchctl bootout system "$plist_path" >/dev/null 2>&1 || true
    if /bin/launchctl print "system/$label" >/dev/null 2>&1; then exit 69; fi
  fi
  remove_installed_key
  if [ -f "$base_dir/remote-login-was-on.txt" ] && [ "$(/bin/cat "$base_dir/remote-login-was-on.txt")" = '0' ]; then
    /usr/sbin/systemsetup -setremotelogin off >/dev/null
  fi
  /bin/rm -f "$plist_path" "$newsyslog_path"
  /bin/rm -rf "$base_dir"
  exit 0
fi

if [ "$action" != 'prepare' ] || [ ! -f "$plan_path" ]; then
  exit 64
fi

case "$plan_sha256" in
  ''|*[!0-9a-f]* ) exit 64 ;;
esac
[ "${#plan_sha256}" -eq 64 ] || exit 64

/bin/mkdir -p "$base_dir"
/usr/sbin/chown root:wheel "$base_dir"
/bin/chmod 711 "$base_dir"
protected_plan=$(/usr/bin/mktemp "$base_dir/connector-plan.XXXXXX")
/usr/bin/install -m 600 "$plan_path" "$protected_plan"
[ "$(/usr/bin/shasum -a 256 "$protected_plan" | /usr/bin/awk '{print $1}')" = "$plan_sha256" ] || {
  /bin/rm -f "$protected_plan"
  exit 67
}
plan_path="$protected_plan"
trap '/bin/rm -f "$protected_plan"' EXIT

planned_base=$(plan_value baseDir)
employee_home=$(plan_value employeeHome)
employee_user=$(plan_value employeeUser)
relay_private_source=$(plan_value relayPrivateKeySource)
relay_private_sha256=$(plan_value relayPrivateKeySha256)
relay_public_key=$(plan_value relayPublicKey)
authorized_public_key=$(plan_value authorizedPublicKey)
relay_host=$(plan_value relay.host)
relay_port=$(plan_value relay.port)
relay_user=$(plan_value relay.user)
remote_port=$(plan_value relay.remotePort)
relay_fingerprint=$(plan_value relay.hostKeySha256)

console_user=$(/usr/bin/stat -f '%Su' /dev/console)
console_home=$(/usr/bin/dscl . -read "/Users/$console_user" NFSHomeDirectory 2>/dev/null | /usr/bin/awk '{print $2}')

if [ "$planned_base" != "$base_dir" ] || [ "$employee_user" != "$console_user" ] || [ "$employee_home" != "$console_home" ] || [ ! -d "$employee_home" ]; then
  exit 65
fi

case "$relay_private_source" in
  "$employee_home"/*) ;;
  *) exit 65 ;;
esac

case "$relay_host" in
  localhost|0.0.0.0|127.*|::|::1|'') exit 65 ;;
esac

case "$relay_host$relay_user" in
  *[!A-Za-z0-9._@-]*) exit 65 ;;
esac

case "$relay_port$remote_port" in
  *[!0-9]*) exit 65 ;;
esac

case "$relay_private_sha256" in
  ''|*[!0-9a-f]* ) exit 65 ;;
esac
[ "${#relay_private_sha256}" -eq 64 ] || exit 65

/bin/mkdir -p "$base_dir/keys" "$base_dir/control" "$base_dir/logs"
/bin/chmod 711 "$base_dir"
/bin/chmod 700 "$base_dir/keys"

/usr/bin/install -m 600 "$relay_private_source" "$base_dir/keys/relay_client.candidate"
[ "$(/usr/bin/shasum -a 256 "$base_dir/keys/relay_client.candidate" | /usr/bin/awk '{print $1}')" = "$relay_private_sha256" ] || {
  /bin/rm -f "$base_dir/keys/relay_client.candidate"
  exit 67
}

candidate_hosts="$base_dir/keys/known_hosts.candidate"
/usr/bin/ssh-keyscan -T 10 -p "$relay_port" "$relay_host" > "$candidate_hosts" 2>/dev/null

if ! /usr/bin/ssh-keygen -E sha256 -lf "$candidate_hosts" | /usr/bin/awk '{print $2}' | /usr/bin/grep -Fqx -- "$relay_fingerprint"; then
  /bin/rm -f "$candidate_hosts" "$base_dir/keys/relay_client.candidate"
  exit 66
fi

/bin/mv "$base_dir/keys/relay_client.candidate" "$base_dir/keys/relay_client"
/bin/mv "$candidate_hosts" "$base_dir/keys/known_hosts"
/bin/chmod 600 "$base_dir/keys/relay_client" "$base_dir/keys/known_hosts"

if ! /usr/sbin/systemsetup -getremotelogin 2>/dev/null | /usr/bin/grep -q 'On$'; then
  /usr/bin/printf '0\n' > "$base_dir/remote-login-was-on.txt"
  /usr/sbin/systemsetup -setremotelogin on >/dev/null
else
  /usr/bin/printf '1\n' > "$base_dir/remote-login-was-on.txt"
fi

/usr/bin/ssh-keygen -A
/bin/test ! -L "$employee_home/.ssh" || exit 68
/bin/mkdir -p "$employee_home/.ssh"
/bin/test ! -L "$employee_home/.ssh/authorized_keys" || exit 68
/usr/bin/touch "$employee_home/.ssh/authorized_keys"

if ! /usr/bin/grep -Fqx -- "$authorized_public_key" "$employee_home/.ssh/authorized_keys"; then
  /usr/bin/printf '\n%s\n' "$authorized_public_key" >> "$employee_home/.ssh/authorized_keys"
  /usr/bin/printf '1\n' > "$base_dir/employee-authorized-key-added.txt"
else
  /usr/bin/printf '0\n' > "$base_dir/employee-authorized-key-added.txt"
fi

/usr/sbin/chown "$employee_user" "$employee_home/.ssh" "$employee_home/.ssh/authorized_keys"
/bin/chmod 700 "$employee_home/.ssh"
/bin/chmod 600 "$employee_home/.ssh/authorized_keys"
/usr/bin/printf '%s\n' "$authorized_public_key" > "$base_dir/employee-authorized-key.pub"
/usr/bin/printf '%s\n' "$employee_home" > "$base_dir/employee-home.txt"
/usr/bin/printf '%s\n' "$employee_user" > "$base_dir/employee-user.txt"

/usr/bin/printf '%s\n' "$relay_public_key" > "$base_dir/keys/relay_client.pub"
/bin/chmod 600 "$base_dir/keys/relay_client.pub"

wrapper_path="$base_dir/run-connector.sh"
/bin/cat > "$wrapper_path" <<EOF
#!/bin/sh
set -eu
enabled_path='$base_dir/control/enabled'
ready_path='$base_dir/control/ready'
ssh_pid=''
cleanup() {
  /bin/rm -f "\$ready_path"
  if [ -n "\$ssh_pid" ]; then /bin/kill "\$ssh_pid" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM
/bin/rm -f "\$ready_path"
enabled() { [ -f "\$enabled_path" ] && /usr/bin/grep -Fqx -- 'enabled' "\$enabled_path"; }
while ! enabled; do /bin/sleep 2; done
while enabled; do
  /bin/rm -f "\$ready_path"
  /usr/bin/ssh -NT -i '$base_dir/keys/relay_client' -p '$relay_port' -R '0.0.0.0:$remote_port:127.0.0.1:22' -o 'BatchMode=yes' -o 'ExitOnForwardFailure=yes' -o 'IdentitiesOnly=yes' -o 'ServerAliveInterval=30' -o 'ServerAliveCountMax=3' -o 'StrictHostKeyChecking=yes' -o 'UserKnownHostsFile=$base_dir/keys/known_hosts' '$relay_user@$relay_host' &
  ssh_pid=\$!
  /bin/sleep 2
  if /bin/kill -0 "\$ssh_pid" >/dev/null 2>&1; then
    /usr/bin/touch "\$ready_path"
    /bin/chmod 644 "\$ready_path"
  fi
  wait "\$ssh_pid" || true
  ssh_pid=''
  /bin/rm -f "\$ready_path"
  /bin/sleep 5
done
EOF
/bin/chmod 700 "$wrapper_path"

/bin/cat > "$plist_path" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>$label</string>
<key>ProgramArguments</key><array><string>/bin/sh</string><string>$wrapper_path</string></array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><dict><key>NetworkState</key><true/><key>SuccessfulExit</key><false/></dict>
<key>ProcessType</key><string>Background</string>
<key>ThrottleInterval</key><integer>5</integer>
<key>StandardOutPath</key><string>$base_dir/logs/connector.log</string>
<key>StandardErrorPath</key><string>$base_dir/logs/connector.log</string>
</dict></plist>
EOF
/bin/chmod 644 "$plist_path"

/usr/bin/printf '%s %s:staff 600 5 5120 * J\n' "$base_dir/logs/connector.log" "$employee_user" > "$newsyslog_path"
/bin/chmod 644 "$newsyslog_path"
/usr/sbin/chown -R root:wheel "$base_dir"
/bin/chmod 711 "$base_dir/control"
/usr/bin/touch "$base_dir/control/enabled"
/usr/sbin/chown "$employee_user":staff "$base_dir/control/enabled"
/bin/chmod 600 "$base_dir/control/enabled"
/usr/sbin/chown "$employee_user":staff "$base_dir/logs"
/bin/chmod 700 "$base_dir/logs"
/usr/bin/touch "$base_dir/logs/connector.log"
/usr/sbin/chown "$employee_user":staff "$base_dir/logs/connector.log"
/bin/chmod 600 "$base_dir/logs/connector.log"
/bin/rm -f "$base_dir/control/ready"

/bin/launchctl bootout system "$plist_path" >/dev/null 2>&1 || true
/bin/launchctl bootstrap system "$plist_path"

/bin/cat /etc/ssh/ssh_host_*_key.pub > "$base_dir/control/ssh-host-public-keys.txt"
/bin/chmod 644 "$base_dir/control/ssh-host-public-keys.txt"
