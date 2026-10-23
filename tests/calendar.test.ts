import test from "node:test";
import assert from "node:assert/strict";
import {dateValue,parseLocalDate,timeOptions} from "../src/lib/calendar";

test("calendar values retain local calendar days and reject impossible dates",()=>{
  const value=new Date(2026,9,20,23,30);
  assert.equal(dateValue(value),"2026-10-20");
  assert.equal(dateValue(undefined),"");
  const parsed=parseLocalDate("2026-10-20");assert.ok(parsed);assert.equal(parsed.getFullYear(),2026);assert.equal(parsed.getMonth(),9);assert.equal(parsed.getDate(),20);assert.equal(dateValue(parsed),"2026-10-20");
  assert.equal(parseLocalDate("2026-02-29"),undefined);assert.equal(parseLocalDate("2026-04-31"),undefined);assert.equal(parseLocalDate("2026-13-01"),undefined);assert.equal(parseLocalDate(""),undefined);assert.equal(parseLocalDate("20/10/2026"),undefined);
  assert.equal(dateValue(parseLocalDate("2024-02-29")),"2024-02-29");
});

test("time intervals respect opening and closing restrictions",()=>{
  const values=timeOptions(15,"09:00","10:00");assert.deepEqual(values,["09:00","09:15","09:30","09:45","10:00"]);
  const day=timeOptions(30);assert.equal(day[0],"00:00");assert.equal(day.at(-1),"23:30");assert.equal(day.length,48);
  assert.deepEqual(timeOptions(15,"17:00","09:00"),[]);
});
