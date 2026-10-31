from worker import run_once


def test_dispatches_job_and_exit_codes(monkeypatch, capsys):
    claimed = []
    monkeypatch.setattr(run_once.main, "claim_job", lambda i: claimed.append(i) or {"id": i})
    monkeypatch.setattr(run_once.main, "process", lambda job: "done")
    assert run_once.cli(["job", "abc"]) == 0
    assert claimed == ["abc"] and "job abc: done" in capsys.readouterr().out

    monkeypatch.setattr(run_once.main, "process", lambda job: "failed")
    assert run_once.cli(["job", "abc"]) == 1

    monkeypatch.setattr(run_once.main, "claim_job", lambda i: None)
    assert run_once.cli(["job", "abc"]) == 1


def test_bad_args():
    assert run_once.cli(["nope", "abc"]) == 2
    assert run_once.cli(["job"]) == 2


def test_dispatches_render(monkeypatch, capsys):
    monkeypatch.setattr(run_once.render, "run_once", lambda i: "done")
    monkeypatch.setitem(run_once.HANDLERS, "render", run_once.render.run_once)
    assert run_once.cli(["render", "c1"]) == 0
    assert "render c1: done" in capsys.readouterr().out
