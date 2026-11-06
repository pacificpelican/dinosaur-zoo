<?php
declare(strict_types=1);

function zooStartSession(string $projectRoot, bool $allowWebrootFallback = false): bool {
    if (session_status() === PHP_SESSION_ACTIVE) return true;
    if (session_status() === PHP_SESSION_DISABLED) {
        error_log('Zoo API: PHP sessions are disabled.');
        return false;
    }

    $https = !empty($_SERVER['HTTPS']) && strtolower((string)$_SERVER['HTTPS']) !== 'off';
    session_set_cookie_params(['path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Lax']);
    $defaultPath = session_save_path();
    $documentRoot = realpath((string)($_SERVER['DOCUMENT_ROOT'] ?? ''));
    $siteId = substr(hash('sha256', realpath($projectRoot) ?: $projectRoot), 0, 20);
    $candidates = [];
    if ($documentRoot !== false) {
        $candidates[] = [dirname($documentRoot) . DIRECTORY_SEPARATOR . 'tmp_sessions' . DIRECTORY_SEPARATOR . 'dinosaurs-friends-zoo-' . $siteId, false];
    }
    if ($allowWebrootFallback) $candidates[] = [$projectRoot . DIRECTORY_SEPARATOR . '.sessions', true];
    $candidates[] = [sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'dinosaurs-friends-zoo-' . $siteId, false];

    // Custom session handlers may not use filesystem paths.
    if (ini_get('session.save_handler') === 'files') {
        foreach ($candidates as [$dir, $webrootFallback]) {
            if (!is_dir($dir) && !@mkdir($dir, 0700, true) && !is_dir($dir)) continue;
            $resolved = realpath($dir);
            if ($resolved === false || !is_writable($resolved)) continue;
            if (!$webrootFallback && $documentRoot !== false &&
                ($resolved === $documentRoot || strncmp($resolved, $documentRoot . DIRECTORY_SEPARATOR, strlen($documentRoot . DIRECTORY_SEPARATOR)) === 0)) continue;
            if ($webrootFallback) {
                $guard = $resolved . DIRECTORY_SEPARATOR . '.htaccess';
                $rules = "Require all denied\nDeny from all\n";
                if (!is_file($guard) && @file_put_contents($guard, $rules, LOCK_EX) === false) {
                    error_log('Zoo API: could not protect the web-root session directory.');
                    continue;
                }
                if (@file_get_contents($guard) !== $rules) {
                    error_log('Zoo API: web-root session directory has unexpected access rules.');
                    continue;
                }
            }
            if (@session_save_path($resolved) !== false && @session_start()) return true;
            error_log('Zoo API: a custom PHP session directory could not be used.');
        }
        @session_save_path($defaultPath);
    }
    if (@session_start()) return true;
    error_log('Zoo API: failed to start PHP session; check session storage configuration and permissions.');
    return false;
}
