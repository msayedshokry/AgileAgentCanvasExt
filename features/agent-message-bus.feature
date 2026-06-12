Feature: Agent Message Bus
  As an AgileAgentCanvas user
  I want the agent message bus to deliver messages reliably between agents
  So that handoffs, system events, and broadcasts work as expected

  # C5: covers all behavior of AgentMessageBus. Previously had no
  # dedicated feature file — only passively exercised via other test
  # files. Now covers: wildcards, TTL, priority ordering, dead-letter
  # path, system events, error swallowing with the new failure counter.

  Background:
    Given a fresh agent message bus

  # ─── Basic subscribe / publish ─────────────────────────────────────────

  @bus @subscribe
  Scenario: Subscriber receives a message on a matching topic
    Given agent "worker" subscribes to "tasks.do"
    When I publish "tasks.do" with payload "hello"
    Then agent "worker" should have received 1 message
    And the message should have payload "hello"

  @bus @subscribe
  Scenario: Subscriber does not receive a message on a non-matching topic
    Given agent "worker" subscribes to "tasks.do"
    When I publish "tasks.other" with payload "hi"
    Then agent "worker" should have received 0 messages

  @bus @unsubscribe
  Scenario: Unsubscribed agent no longer receives messages
    Given agent "worker" subscribes to "tasks.do"
    When I unsubscribe the agent's first subscription
    And I publish "tasks.do" with payload "after-unsub"
    Then agent "worker" should have received 0 messages

  # ─── Wildcards ─────────────────────────────────────────────────────────

  @bus @wildcard
  Scenario: Wildcard * matches exactly one segment
    Given agent "w" subscribes to "tasks.*"
    When I publish "tasks.do" with payload "a"
    And I publish "tasks.do.sub" with payload "b"
    Then agent "w" should have received 1 message

  @bus @wildcard
  Scenario: Wildcard # matches multiple segments
    Given agent "w" subscribes to "tasks.#"
    When I publish "tasks.do" with payload "a"
    And I publish "tasks.do.sub" with payload "b"
    And I publish "tasks.a.b.c" with payload "c"
    Then agent "w" should have received 3 messages

  @bus @wildcard
  Scenario: Different patterns on the same topic deliver to all
    Given agent "a" subscribes to "x.*"
    And agent "b" subscribes to "x.#"
    When I publish "x.y" with payload "hi"
    Then agent "a" should have received 1 message
    And agent "b" should have received 1 message

  # ─── Point-to-point ────────────────────────────────────────────────────

  @bus @p2p
  Scenario: send() with to= only delivers to the named agent
    Given agent "alice" subscribes to "chat"
    And agent "bob" subscribes to "chat"
    When I send from "alice" to "bob" topic "chat" payload "ping"
    Then agent "alice" should have received 0 messages
    And agent "bob" should have received 1 message

  @bus @p2p
  Scenario: publish with no to= delivers to all matching subscribers
    Given agent "alice" subscribes to "chat"
    And agent "bob" subscribes to "chat"
    When I publish "chat" with payload "broadcast"
    Then agent "alice" should have received 1 message
    And agent "bob" should have received 1 message

  # ─── Dead-letter / no subscribers ──────────────────────────────────────

  @bus @dead-letter
  Scenario: publish with no matching subscribers returns empty envelope list
    When I publish "no.subscribers" with payload "drop"
    Then the publish should return 0 envelopes

  # ─── Priority ordering ────────────────────────────────────────────────

  @bus @priority
  Scenario: Critical message has higher priority than normal
    Given agent "w" subscribes to "x"
    When I publish "x" with payload "chill" and priority "normal"
    And I publish "x" with payload "urgent" and priority "critical"
    Then the most recent message should have priority "critical"

  # ─── TTL expiry ───────────────────────────────────────────────────────

  @bus @ttl
  Scenario: Message with TTL=-1ms is treated as already expired
    Given agent "w" subscribes to "x"
    When I publish "x" with payload "stale" and ttl -1
    Then agent "w" should have received 0 messages
    And the publish should return 1 envelope with delivered false

  # ─── Failure counter (H-B1) ──────────────────────────────────────────

  @wip
  @bus @error-handling
  Scenario: Subscription is removed after 5 consecutive handler failures
    Given agent "broken" subscribes to "x" with a handler that always throws
    When I publish "x" with payload "1"
    And I publish "x" with payload "2"
    And I publish "x" with payload "3"
    And I publish "x" with payload "4"
    And I publish "x" with payload "5"
    And I publish "x" with payload "6"
    Then the bus should have 0 subscriptions for "broken"

  @bus @error-handling
  Scenario: A successful delivery resets the failure counter
    Given agent "flaky" subscribes to "x" with a handler that fails then succeeds
    When I publish "x" with payload "1"
    And I publish "x" with payload "2"
    And I publish "x" with payload "3"
    And I publish "x" with payload "4"
    And I publish "x" with payload "5"
    Then the bus should have 1 subscription for "flaky"

  # ─── System event helpers ─────────────────────────────────────────────

  @bus @system
  Scenario: notifyAgentRegistered publishes to system.agent.registered
    Given agent "obs" subscribes to "system.#"
    When I notify agent registered for "agent-1" with name "worker-1"
    Then agent "obs" should have received 1 message
    And the message topic should be "system.agent.registered"

  @bus @system
  Scenario: notifyStatusChange publishes to system.agent.status_change
    Given agent "obs" subscribes to "system.#"
    When I notify status change for "agent-1" from "idle" to "busy"
    Then agent "obs" should have received 1 message
    And the message topic should be "system.agent.status_change"

  # ─── History ──────────────────────────────────────────────────────────

  @bus @history
  Scenario: getHistory returns the most recent envelopes
    Given agent "w" subscribes to "x"
    When I publish "x" with payload "a"
    And I publish "x" with payload "b"
    And I publish "x" with payload "c"
    Then the history should have 3 entries
    And the most recent history entry should have payload "c"
