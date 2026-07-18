//go:build ignore

// Codewolf repository validation runner.
//
// Run it through Bun from the repository root:
//
//	bun run tests
//
// Successful commands stay silent. When one or more commands fail, only the
// failing command blocks and their captured output are printed.
package main

import (
	"bytes"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

const maxCapturedBytes = 16 * 1024 * 1024

type check struct {
	name string
	args []string
}

type cappedBuffer struct {
	buffer    bytes.Buffer
	truncated bool
}

func (b *cappedBuffer) Write(p []byte) (int, error) {
	remaining := maxCapturedBytes - b.buffer.Len()
	if remaining <= 0 {
		b.truncated = true
		return len(p), nil
	}
	if len(p) > remaining {
		_, _ = b.buffer.Write(p[:remaining])
		b.truncated = true
		return len(p), nil
	}
	return b.buffer.Write(p)
}

func (b *cappedBuffer) String() string {
	value := b.buffer.String()
	if b.truncated {
		value += "\n[output truncated after 16 MiB]\n"
	}
	return value
}

var ansiEscape = regexp.MustCompile(`\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))`)

func main() {
	repoRoot, err := findRepositoryRoot()
	if err != nil {
		printFailure("repository", nil, err.Error())
		os.Exit(1)
	}

	bunPath, err := exec.LookPath("bun")
	if err != nil {
		printFailure("bun", nil, "Bun was not found in PATH.")
		os.Exit(1)
	}

	install := check{
		name: "Install dependencies",
		args: []string{"install", "--frozen-lockfile"},
	}
	if failure := runCheck(repoRoot, bunPath, install); failure != "" {
		printFailure(install.name, install.args, failure)
		os.Exit(1)
	}

	checks := []check{
		{name: "Typecheck common", args: []string{"run", "--cwd", "./common", "typecheck"}},
		{name: "Typecheck agents", args: []string{"run", "--cwd", "./agents", "typecheck"}},
		{name: "Typecheck agent-runtime", args: []string{"run", "--cwd", "./packages/agent-runtime", "typecheck"}},
		{name: "Typecheck SDK", args: []string{"run", "--cwd", "./sdk", "typecheck"}},
		{name: "Typecheck CLI", args: []string{"run", "--cwd", "./cli", "typecheck"}},
		{name: "Settings tests", args: []string{"test", "cli/src/utils/__tests__/settings.test.ts"}},
		{name: "Research model tests", args: []string{"test", "cli/src/utils/__tests__/research-models.test.ts"}},
		{name: "Subagent provider tests", args: []string{"test", "packages/agent-runtime/src/__tests__/custom-provider-subagent-context.test.ts"}},
		{name: "Complete test suite", args: []string{"test"}},
		{name: "Binary build", args: []string{"run", "build:binary"}},
	}

	failed := false
	for _, current := range checks {
		if failure := runCheck(repoRoot, bunPath, current); failure != "" {
			failed = true
			printFailure(current.name, current.args, failure)
		}
	}

	if failed {
		os.Exit(1)
	}
}

func runCheck(repoRoot, executable string, current check) string {
	cmd := exec.Command(executable, current.args...)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), "NO_COLOR=1", "FORCE_COLOR=0")

	var output cappedBuffer
	cmd.Stdout = &output
	cmd.Stderr = &output

	if err := cmd.Run(); err != nil {
		text := strings.TrimSpace(stripANSI(output.String()))
		if text == "" {
			text = err.Error()
		} else {
			text = fmt.Sprintf("%s\n\n%s", err.Error(), text)
		}
		return text
	}
	return ""
}

func printFailure(name string, args []string, details string) {
	fmt.Fprintf(os.Stderr, "\n===== ERROR: %s =====\n", name)
	if len(args) > 0 {
		fmt.Fprintf(os.Stderr, "bun %s\n", strings.Join(args, " "))
	}
	fmt.Fprintln(os.Stderr, strings.TrimSpace(details))
}

func stripANSI(value string) string {
	return ansiEscape.ReplaceAllString(value, "")
}

func findRepositoryRoot() (string, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return "", err
	}

	current, err := filepath.Abs(cwd)
	if err != nil {
		return "", err
	}

	for {
		if isRepositoryRoot(current) {
			return current, nil
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
		current = parent
	}
	return "", errors.New("could not find package.json and bun.lock in this directory or its parents")
}

func isRepositoryRoot(directory string) bool {
	return fileExists(filepath.Join(directory, "package.json")) &&
		fileExists(filepath.Join(directory, "bun.lock"))
}

func fileExists(filePath string) bool {
	stat, err := os.Stat(filePath)
	return err == nil && !stat.IsDir()
}
