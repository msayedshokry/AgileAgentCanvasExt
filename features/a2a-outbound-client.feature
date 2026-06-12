Feature: A2A Outbound Client
  As an AgileAgentCanvas user
  I want the A2A Outbound Client to safely delegate to remote agents
  So that kanban transitions can offload work to A2A-compatible services

  # C4: covers all behaviour of A2AOutboundClient — previously had ZERO
  # direct test coverage. Uses an injected fetch mock; no real network IO.

  Background:
    Given a fresh A2A outbound client with allowed hosts:
      | host         |
      | example.com  |
      | localhost    |
    And a mock fetch that returns:
      | status | body                                                                                            |
      | 200    | {"name":"agent","version":"0.2.0","protocolVersion":"0.3.0","url":"https://x","skills":[]}    |

  # ─── Agent Card fetching ───────────────────────────────────────────────

  @a2a @card
  Scenario: fetchAgentCard returns validated card on 200 + valid JSON
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then the result should be a valid A2A agent card

  @a2a @card
  Scenario: fetchAgentCard throws on non-object body
    Given a mock fetch that returns:
      | status | body   |
      | 200    | []     |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown

  @a2a @card
  Scenario: fetchAgentCard throws on primitive body
    Given a mock fetch that returns:
      | status | body    |
      | 200    | "ok"    |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown

  @a2a @card
  Scenario: fetchAgentCard throws A2ANetworkError on 401
    Given a mock fetch that returns:
      | status | body | statusText |
      | 401    |      | Unauthorized |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown

  @a2a @card
  Scenario: fetchAgentCard throws A2ANetworkError on 403
    Given a mock fetch that returns:
      | status | body | statusText |
      | 403    |      | Forbidden |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown

  @a2a @card
  Scenario: fetchAgentCard throws A2ANetworkError on 500
    Given a mock fetch that returns:
      | status | body | statusText |
      | 500    |      | Server Error |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown

  @a2a @card @ssrf @wip
  Scenario: fetchAgentCard rejects private IP 127.0.0.1 without explicit allow
    Given a fresh A2A outbound client with allowed hosts:
      | host |
    When I call fetchAgentCard with "https://127.0.0.1/agent-card.json"
    Then an A2ANetworkError should be thrown with "Refusing to fetch private"

  @a2a @card @ssrf @wip
  Scenario: fetchAgentCard rejects cloud metadata 169.254.169.254
    Given a fresh A2A outbound client with allowed hosts:
      | host |
    When I call fetchAgentCard with "https://169.254.169.254/latest/meta-data"
    Then an A2ANetworkError should be thrown with "Refusing to fetch private"

  @a2a @card @ssrf @wip
  Scenario: fetchAgentCard rejects file:// scheme
    Given a fresh A2A outbound client with allowed hosts:
      | host |
    When I call fetchAgentCard with "file:///etc/passwd"
    Then an A2ANetworkError should be thrown with "protocol"

  @a2a @card @ssrf @wip
  Scenario: fetchAgentCard rejects malformed URL
    Given a fresh A2A outbound client with allowed hosts:
      | host |
    When I call fetchAgentCard with "not a url"
    Then an A2ANetworkError should be thrown with "malformed"

  @a2a @card @ssrf
  Scenario: fetchAgentCard allows explicitly allowlisted host
    Given a fresh A2A outbound client with allowed hosts:
      | host         |
      | my-agent.dev |
    And a mock fetch that returns:
      | status | body                                                                                       |
      | 200    | {"name":"a","version":"0.2.0","protocolVersion":"0.3.0","url":"https://x","skills":[]}   |
    When I call fetchAgentCard with "https://my-agent.dev/agent-card.json"
    Then the result should be a valid A2A agent card

  @a2a @card @ssrf @wip
  Scenario: fetchAgentCard rejects non-allowlisted external host
    Given a fresh A2A outbound client with allowed hosts:
      | host         |
      | my-agent.dev |
    When I call fetchAgentCard with "https://evil.example.org/agent-card.json"
    Then an A2ANetworkError should be thrown with "not in"

  @a2a @card @size @wip
  Scenario: fetchAgentCard rejects response with Content-Length > 1 MB
    Given a mock fetch that returns:
      | status | body                                                                                       | contentLength |
      | 200    | {"name":"a","version":"0.2.0","protocolVersion":"0.3.0","url":"https://x","skills":[]}   | 2000000       |
    When I call fetchAgentCard with "https://example.com/agent-card.json"
    Then an A2ANetworkError should be thrown with "too large"

  # ─── sendMessage / getTask / waitForCompletion ─────────────────────────

  @a2a @send
  Scenario: sendMessage normalizes a complete task response
    Given a mock fetch that returns:
      | status | body                                                                                                                                              |
      | 200    | {"jsonrpc":"2.0","id":"1","result":{"task":{"id":"t1","contextId":"c1","status":{"state":"working","timestamp":"2026-06-09T00:00:00Z"},"history":[]}}} |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then the result should have id "t1"
    And the result should have state "working"

  @a2a @send
  Scenario: sendMessage handles missing result.task without crashing
    Given a mock fetch that returns:
      | status | body                          |
      | 200    | {"jsonrpc":"2.0","id":"1"}   |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown with "empty or undefined"

  @a2a @send
  Scenario: sendMessage handles result being a primitive without crashing
    Given a mock fetch that returns:
      | status | body                          |
      | 200    | {"jsonrpc":"2.0","id":"1","result":42} |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown with "empty or undefined"

  @a2a @send @wip
  Scenario: sendMessage normalizes unknown task state to "submitted"
    Given a mock fetch that returns:
      | status | body                                                                                                       |
      | 200    | {"jsonrpc":"2.0","result":{"task":{"id":"t1","status":{"state":"i-am-not-a-state"}}}}                       |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then the result should have state "submitted"

  @a2a @send
  Scenario: sendMessage normalizes a task with full history and artifacts
    Given a mock fetch that returns:
      | status | body                                                                                                                                              |
      | 200    | {"jsonrpc":"2.0","result":{"task":{"id":"t1","contextId":"c1","status":{"state":"completed"},"history":[{"messageId":"m1","role":"user","parts":[{"text":"hi","mediaType":"text/plain"}]}],"artifacts":[{"artifactId":"a1","name":"output","parts":[{"data":{"x":1},"mediaType":"application/json"}]}]}}} |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then the result should have 1 history message
    And the result should have 1 artifact

  @a2a @send @wip
  Scenario: sendMessage handles non-object task value without crashing
    Given a mock fetch that returns:
      | status | body                                |
      | 200    | {"jsonrpc":"2.0","result":{"task":[]}} |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown

  @a2a @send
  Scenario: sendMessage handles null task value without crashing
    Given a mock fetch that returns:
      | status | body                                |
      | 200    | {"jsonrpc":"2.0","result":{"task":null}} |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown

  @a2a @send
  Scenario: sendMessage converts JSON-RPC error response to A2ANetworkError
    Given a mock fetch that returns:
      | status | body                                                                                  |
      | 200    | {"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"}}               |
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown with "JSON-RPC"

  @a2a @wait
  Scenario: waitForCompletion returns terminal state on first poll
    Given a mock fetch that returns the same response 1 times:
      | status | body                                                                                                            |
      | 200    | {"jsonrpc":"2.0","result":{"task":{"id":"t1","status":{"state":"completed"},"history":[]}}}                     |
    And the client has poll interval 50ms
    When I call waitForCompletion on "https://example.com/rpc" for task "t1"
    Then the result should have state "completed"

  @a2a @wait
  Scenario: waitForCompletion throws A2ATimeoutError when polling exceeds maxWaitTime
    Given a mock fetch that returns the same response 100 times:
      | status | body                                                                                                            |
      | 200    | {"jsonrpc":"2.0","result":{"task":{"id":"t1","status":{"state":"working"},"history":[]}}}                       |
    And the client has poll interval 10ms and maxWaitTime 50ms
    When I call waitForCompletion on "https://example.com/rpc" for task "t1"
    Then an A2ATimeoutError should be thrown

  @a2a @sendAndWait
  Scenario: sendMessageAndWait returns completed task end-to-end
    Given a mock fetch that returns the same response 2 times:
      | status | body                                                                                                            |
      | 200    | {"jsonrpc":"2.0","result":{"task":{"id":"t1","status":{"state":"completed"},"history":[]}}}                     |
    And the client has poll interval 10ms
    When I call sendMessageAndWait to "https://example.com/rpc" with text "go"
    Then the result should have state "completed"

  # ─── Fetch failures ────────────────────────────────────────────────────

  @a2a @network
  Scenario: sendMessage throws A2ANetworkError when fetch itself rejects
    Given a mock fetch that rejects with "ECONNREFUSED"
    When I call sendMessage to "https://example.com/rpc" with text "do thing"
    Then an A2ANetworkError should be thrown
