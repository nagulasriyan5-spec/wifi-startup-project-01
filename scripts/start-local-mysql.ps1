$ErrorActionPreference = "Stop"

$mysqlBase = "C:\Program Files\MySQL\MySQL Server 8.0"
$mysqld = Join-Path $mysqlBase "bin\mysqld.exe"
$mysql = Join-Path $mysqlBase "bin\mysql.exe"
$appRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$dataDir = Join-Path $appRoot "local-mysql-data"
$port = 3307

function Test-MySqlReady {
  try {
    & $mysql --protocol=tcp --host=127.0.0.1 --port=$port --user=root --silent --skip-column-names --execute="SELECT 1" *> $null
    return $LASTEXITCODE -eq 0
  } catch {
    return $false
  }
}

if (!(Test-Path $mysqld) -or !(Test-Path $mysql)) {
  throw "MySQL Server 8.0 was not found at $mysqlBase. Install MySQL Server or use Docker with database/docker-compose.yml."
}

if (!(Test-Path $dataDir)) {
  New-Item -ItemType Directory -Path $dataDir | Out-Null
}

$isInitialized = Test-Path (Join-Path $dataDir "auto.cnf")
if (!$isInitialized) {
  Write-Output "Initializing local MySQL data directory..."
  & $mysqld --no-defaults --initialize-insecure --basedir="$mysqlBase" --datadir="$dataDir" 2>&1 | Write-Output
}

$ready = Test-MySqlReady
if (!$ready) {
  $args = @(
    "--no-defaults",
    "--basedir=`"$mysqlBase`"",
    "--datadir=`"$dataDir`"",
    "--port=$port",
    "--bind-address=127.0.0.1",
    "--mysqlx=0",
    "--skip-log-bin",
    "--log-error=`"$dataDir\mysqld-run.err`""
  )

  $process = Start-Process -FilePath $mysqld -ArgumentList $args -WindowStyle Hidden -PassThru
  Write-Output "Started local MySQL on port $port (PID $($process.Id))."

  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $ready = Test-MySqlReady
    if ($ready) { break }
  }

  if (!$ready) {
    if (Test-Path "$dataDir\mysqld-run.err") {
      Get-Content "$dataDir\mysqld-run.err" -Tail 80
    }
    throw "Local MySQL did not start on port $port."
  }
} else {
  Write-Output "Local MySQL is already ready on port $port."
}

$sql = @"
CREATE DATABASE IF NOT EXISTS sriyan CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'sriyan'@'%' IDENTIFIED BY 'sriyan';
CREATE USER IF NOT EXISTS 'sriyan'@'localhost' IDENTIFIED BY 'sriyan';
GRANT ALL PRIVILEGES ON sriyan.* TO 'sriyan'@'%';
GRANT ALL PRIVILEGES ON sriyan.* TO 'sriyan'@'localhost';
FLUSH PRIVILEGES;
"@

& $mysql --protocol=tcp --host=127.0.0.1 --port=$port --user=root --execute=$sql
Write-Output "Database ready: mysql://sriyan:sriyan@127.0.0.1:$port/sriyan"
