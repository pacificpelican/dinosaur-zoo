<?php
// Dinosaurs & Friends Zoo - JSON API. The game works without this (browser-only saves, rule-based dialogue).
declare(strict_types=1);

$CONFIG = require __DIR__ . '/../config.php';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function out(array $d, int $code = 200): void { http_response_code($code); echo json_encode($d, JSON_UNESCAPED_UNICODE); exit; }

// ---------- storage drivers ----------
abstract class Store {
    abstract function label(): string;
    abstract function findUser(string $name): ?array;
    abstract function createUser(string $name, string $hash): int;
    abstract function saveGame(int $uid, string $json): void;
    abstract function loadGame(int $uid): ?string;
    abstract function deleteUser(int $uid): void;
}

class JsonStore extends Store {
    private string $dir;
    function __construct(string $dir) { $this->dir = $dir; if (!is_dir($dir)) @mkdir($dir, 0775, true); }
    function label(): string { return 'Local (JSON files)'; }
    // Files are wrapped in a PHP guard so a misconfigured web server cannot serve them as data.
    private function read(string $f): array {
        $p = "$this->dir/$f.php";
        if (!is_file($p)) return [];
        $raw = (string)file_get_contents($p);
        $d = json_decode(substr($raw, (int)strpos($raw, "\n") + 1), true);
        return is_array($d) ? $d : [];
    }
    private function write(string $f, array $d): void {
        file_put_contents("$this->dir/$f.php", "<?php http_response_code(404); exit; ?>\n" . json_encode($d), LOCK_EX);
    }
    function findUser(string $name): ?array {
        foreach ($this->read('users')['users'] ?? [] as $u) if (strtolower($u['name']) === strtolower($name)) return $u;
        return null;
    }
    function createUser(string $name, string $hash): int {
        $d = $this->read('users'); $id = ($d['next'] ?? 1);
        $d['users'][] = ['id' => $id, 'name' => $name, 'hash' => $hash]; $d['next'] = $id + 1;
        $this->write('users', $d); return $id;
    }
    function saveGame(int $uid, string $json): void { $this->write("save_$uid", ['json' => $json, 'at' => time()]); }
    function loadGame(int $uid): ?string { return $this->read("save_$uid")['json'] ?? null; }
    function deleteUser(int $uid): void {
        $d = $this->read('users');
        $d['users'] = array_values(array_filter($d['users'] ?? [], fn($u) => $u['id'] !== $uid));
        $this->write('users', $d);
        @unlink("$this->dir/save_$uid.php");
    }
}

class SqlStore extends Store {
    private PDO $db; private string $lbl;
    function __construct(PDO $db, string $lbl) {
        $this->db = $db; $this->lbl = $lbl;
        $this->db->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        $pk = $lbl === 'sqlite' ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT AUTO_INCREMENT PRIMARY KEY';
        $db->exec("CREATE TABLE IF NOT EXISTS zoo_users (id $pk, name VARCHAR(40) NOT NULL UNIQUE, hash VARCHAR(255) NOT NULL)");
        $db->exec("CREATE TABLE IF NOT EXISTS zoo_saves (user_id INT PRIMARY KEY, json MEDIUMTEXT NOT NULL, saved_at INT NOT NULL)");
    }
    function label(): string { return $this->lbl === 'sqlite' ? 'Local (SQLite)' : 'SQL (MySQL/MariaDB)'; }
    function findUser(string $name): ?array {
        $s = $this->db->prepare('SELECT id, name, hash FROM zoo_users WHERE LOWER(name) = LOWER(?)'); $s->execute([$name]);
        $r = $s->fetch(PDO::FETCH_ASSOC); return $r ? ['id' => (int)$r['id'], 'name' => $r['name'], 'hash' => $r['hash']] : null;
    }
    function createUser(string $name, string $hash): int {
        $this->db->prepare('INSERT INTO zoo_users (name, hash) VALUES (?, ?)')->execute([$name, $hash]);
        return (int)$this->db->lastInsertId();
    }
    function saveGame(int $uid, string $json): void {
        $this->db->prepare('DELETE FROM zoo_saves WHERE user_id = ?')->execute([$uid]);
        $this->db->prepare('INSERT INTO zoo_saves (user_id, json, saved_at) VALUES (?, ?, ?)')->execute([$uid, $json, time()]);
    }
    function loadGame(int $uid): ?string {
        $s = $this->db->prepare('SELECT json FROM zoo_saves WHERE user_id = ?'); $s->execute([$uid]);
        $r = $s->fetchColumn(); return $r === false ? null : (string)$r;
    }
    function deleteUser(int $uid): void {
        $this->db->prepare('DELETE FROM zoo_saves WHERE user_id = ?')->execute([$uid]);
        $this->db->prepare('DELETE FROM zoo_users WHERE id = ?')->execute([$uid]);
    }
}

function openStore(array $c): Store {
    $s = $c['storage']; $m = $s['mysql']; $want = $s['driver'];
    $hasMysql = $m['name'] !== '' && extension_loaded('pdo_mysql');
    if (($want === 'mysql' || $want === 'auto') && $hasMysql) {
        try {
            return new SqlStore(new PDO("mysql:host={$m['host']};port={$m['port']};dbname={$m['name']};charset=utf8mb4", $m['user'], $m['pass']), 'mysql');
        } catch (Throwable $e) { /* fall through to local storage */ }
    }
    if (($want === 'sqlite' || $want === 'auto') && extension_loaded('pdo_sqlite')) {
        try {
            if (!is_dir($s['path'])) @mkdir($s['path'], 0775, true);
            return new SqlStore(new PDO('sqlite:' . $s['path'] . '/zoo.sqlite'), 'sqlite');
        } catch (Throwable $e) { /* fall through */ }
    }
    return new JsonStore($s['path']);
}

// ---------- AI tiers ----------
function httpJson(string $url, array $body, array $headers, int $timeout): ?array {
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => $timeout, 'ignore_errors' => true,
        'header' => implode("\r\n", array_merge(['Content-Type: application/json'], $headers)),
        'content' => json_encode($body),
    ]]);
    $r = @file_get_contents($url, false, $ctx);
    $d = $r === false ? null : json_decode($r, true);
    return is_array($d) ? $d : null;
}

function ollamaUp(array $c): bool {
    $cache = sys_get_temp_dir() . '/zoo_ollama_probe';
    if (is_file($cache) && time() - filemtime($cache) < 30) return file_get_contents($cache) === '1';
    $ctx = stream_context_create(['http' => ['timeout' => 1.0, 'ignore_errors' => true]]);
    $ok = @file_get_contents(rtrim($c['ai']['ollama']['url'], '/') . '/api/tags', false, $ctx) !== false;
    @file_put_contents($cache, $ok ? '1' : '0');
    return $ok;
}

function aiTier(array $c): string {
    $t = $c['ai']['tier'];
    if ($t === 'off') return 'fallback';
    if (($t === 'auto' || $t === 'ollama') && ollamaUp($c)) return 'ollama';
    if (($t === 'auto' || $t === 'cloud') && $c['ai']['cloud']['url'] !== '' && $c['ai']['cloud']['key'] !== '') return 'cloud';
    return 'fallback';
}

function aiComplete(array $c, string $tier, array $messages): ?string {
    $to = (int)$c['ai']['timeout'];
    if ($tier === 'ollama') {
        $d = httpJson(rtrim($c['ai']['ollama']['url'], '/') . '/api/chat', ['model' => $c['ai']['ollama']['model'], 'messages' => $messages, 'stream' => false], [], $to);
        return $d['message']['content'] ?? null;
    }
    if ($tier === 'cloud') {
        $cl = $c['ai']['cloud'];
        $d = httpJson($cl['url'], ['model' => $cl['model'], 'messages' => $messages, 'max_tokens' => 220], ['Authorization: Bearer ' . $cl['key']], $to);
        return $d['choices'][0]['message']['content'] ?? null;
    }
    return null;
}

// ---------- request handling ----------
session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();
$action = $_GET['action'] ?? 'status';
$method = $_SERVER['REQUEST_METHOD'];
$in = [];
if ($method === 'POST') {
    if (stripos($_SERVER['CONTENT_TYPE'] ?? '', 'application/json') !== 0) out(['ok' => false, 'error' => 'JSON required'], 415);
    $in = json_decode(file_get_contents('php://input') ?: '[]', true) ?: [];
}

$store = openStore($CONFIG);
$uid = (int)($_SESSION['uid'] ?? 0);
$uname = (string)($_SESSION['uname'] ?? '');

function cleanName(string $n): string { return preg_replace('/[^A-Za-z0-9_\- ]/', '', trim($n)) ?? ''; }

switch ($action) {
    case 'status': {
        $tier = aiTier($CONFIG);
        out(['ok' => true, 'php' => PHP_VERSION, 'storage' => $store->label(),
             'ai' => ['ollama' => 'Ollama (Local)', 'cloud' => 'Cloud Provider', 'fallback' => 'Fallback Mode'][$tier], 'aiTier' => $tier,
             'loggedIn' => $uid > 0, 'user' => $uname]);
    }
    case 'register': {
        $n = cleanName((string)($in['username'] ?? '')); $p = (string)($in['password'] ?? '');
        if (strlen($n) < 3 || strlen($n) > 24 || strlen($p) < 6) out(['ok' => false, 'error' => 'Username 3-24 characters, password 6+ characters.'], 400);
        if ($store->findUser($n)) out(['ok' => false, 'error' => 'That username is taken.'], 409);
        $id = $store->createUser($n, password_hash($p, PASSWORD_DEFAULT));
        session_regenerate_id(true); $_SESSION['uid'] = $id; $_SESSION['uname'] = $n;
        out(['ok' => true, 'user' => $n]);
    }
    case 'login': {
        $u = $store->findUser(cleanName((string)($in['username'] ?? '')));
        if (!$u || !password_verify((string)($in['password'] ?? ''), $u['hash'])) out(['ok' => false, 'error' => 'Wrong username or password.'], 401);
        session_regenerate_id(true); $_SESSION['uid'] = $u['id']; $_SESSION['uname'] = $u['name'];
        out(['ok' => true, 'user' => $u['name']]);
    }
    case 'logout': { session_destroy(); out(['ok' => true]); }
    case 'save': {
        if (!$uid) out(['ok' => false, 'error' => 'Log in to save to the server.'], 401);
        $json = json_encode($in['state'] ?? null);
        if (!is_string($json) || strlen($json) > 2000000) out(['ok' => false, 'error' => 'Bad save.'], 400);
        $store->saveGame($uid, $json); out(['ok' => true, 'at' => time()]);
    }
    case 'load': {
        if (!$uid) out(['ok' => false, 'error' => 'Log in to load from the server.'], 401);
        $j = $store->loadGame($uid);
        out(['ok' => true, 'state' => $j === null ? null : json_decode($j, true)]);
    }
    case 'delete': {
        if (!$uid) out(['ok' => false, 'error' => 'Not logged in.'], 401);
        $store->deleteUser($uid); session_destroy(); out(['ok' => true]);
    }
    case 'chat': {
        $tier = aiTier($CONFIG);
        if ($tier === 'fallback') out(['ok' => false, 'tier' => 'fallback']);
        $ctx = substr((string)($in['context'] ?? ''), 0, 1500);
        $msgs = [['role' => 'system', 'content' => $ctx . ' Reply in character in 1-3 short sentences. Stay factual about dinosaurs; if unsure, say so.']];
        foreach (array_slice((array)($in['history'] ?? []), -8) as $h) {
            $msgs[] = ['role' => ($h['role'] ?? '') === 'assistant' ? 'assistant' : 'user', 'content' => substr((string)($h['text'] ?? ''), 0, 400)];
        }
        $msgs[] = ['role' => 'user', 'content' => substr((string)($in['message'] ?? ''), 0, 400)];
        $r = aiComplete($CONFIG, $tier, $msgs);
        if (!$r) out(['ok' => false, 'tier' => 'fallback']);
        out(['ok' => true, 'tier' => $tier, 'reply' => trim($r)]);
    }
    case 'species': {
        $tier = aiTier($CONFIG);
        if ($tier === 'fallback') out(['ok' => false, 'tier' => 'fallback']);
        $p = substr((string)($in['parents'] ?? ''), 0, 200);
        $r = aiComplete($CONFIG, $tier, [
            ['role' => 'system', 'content' => 'You name imaginary synthesized dinosaur species. Answer ONLY JSON: {"name":"Genus epithet","blurb":"one sentence"}'],
            ['role' => 'user', 'content' => "Parent species: $p"]]);
        $d = $r ? json_decode(substr($r, (int)strpos($r, '{'), strrpos($r, '}') - (int)strpos($r, '{') + 1), true) : null;
        if (!is_array($d) || empty($d['name'])) out(['ok' => false, 'tier' => 'fallback']);
        out(['ok' => true, 'name' => substr((string)$d['name'], 0, 40), 'blurb' => substr((string)($d['blurb'] ?? ''), 0, 200)]);
    }
    default: out(['ok' => false, 'error' => 'Unknown action'], 404);
}
