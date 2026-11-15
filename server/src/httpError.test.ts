import { beforeEach, describe, expect, it, vi } from 'vitest'
import { captureError } from './errorReporting.js'
import { sendServerError } from './httpError.js'

vi.mock('./errorReporting.js', () => ({ captureError: vi.fn() }))

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    status: vi.fn(),
    json: vi.fn(),
  }
  res.status.mockReturnValue(res)
  return res
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('sendServerError', () => {
  it('reports the error with the same correlation id the client receives', () => {
    const res = fakeResponse()
    const err = new Error('relation "workbooks" does not exist')

    sendServerError(res, 'workbooks.create', err)

    expect(res.status).toHaveBeenCalledWith(500)
    const body = res.json.mock.calls[0][0] as { error: string; errorId: string }
    expect(body.error).toMatch(/Something went wrong/)
    expect(body.errorId).toMatch(/^[0-9a-f]{8}$/)

    expect(captureError).toHaveBeenCalledWith(err, {
      errorId: body.errorId,
      context: 'workbooks.create',
    })
  })

  it('still reports when the response has already started', () => {
    const res = fakeResponse(true)
    const err = new Error('late failure')

    sendServerError(res, 'shares.list', err)

    expect(res.status).not.toHaveBeenCalled()
    expect(res.json).not.toHaveBeenCalled()
    // The client cannot be told, so Sentry is the only place this surfaces.
    expect(captureError).toHaveBeenCalledWith(err, { errorId: expect.any(String), context: 'shares.list' })
  })

  it('handles non-Error throwables', () => {
    const res = fakeResponse()

    sendServerError(res, 'templates.get', 'string rejection')

    expect(captureError).toHaveBeenCalledWith('string rejection', {
      errorId: expect.any(String),
      context: 'templates.get',
    })
  })
})
