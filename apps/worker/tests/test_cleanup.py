from loops import cleanup
from pipeline import cleanup_source


class FakeConn:
    def __init__(self, log, rows):
        self.log, self.rows = log, rows

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def execute(self, sql, params=None):
        self.log.append((" ".join(sql.split()), params))
        return self

    def fetchall(self):
        return self.rows


def test_deletes_source_and_unselected_files(monkeypatch):
    log: list = []
    deleted: list = []
    rows = [{"id": "c2", "file_key": "clips/c2/source.mp4", "thumb_key": "clips/c2/thumb.jpg"}]
    monkeypatch.setattr(cleanup_source.db, "connect", lambda: FakeConn(log, rows))
    monkeypatch.setattr(cleanup_source.r2, "delete", deleted.append)
    cleanup_source.run({"id": "j1", "user_id": "u1", "source_key": "uploads/u1/x/v.mp4"})
    assert deleted == ["clips/c2/source.mp4", "clips/c2/thumb.jpg", "uploads/u1/x/v.mp4"]
    assert "not selected" in log[0][0] and log[0][1] == ("j1", "u1")
    assert log[1][0].startswith("update clips set file_key = null") and log[1][1][0] == ["c2"]
    assert log[2][0].startswith("update jobs set source_deleted_at = now()")


def test_run_once_not_due(monkeypatch):
    monkeypatch.setattr(cleanup, "due", lambda job_id=None: [])
    assert cleanup.run_once("j1").startswith("failed")
